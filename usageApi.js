import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const API_BASE_URL = 'https://chatgpt.com';
const SUMMARY_ENDPOINT = '/backend-api/wham/usage';
const ME_ENDPOINT = '/backend-api/me';

export class UsageApiError extends Error {
    constructor(message, {statusCode = 0, payload = null} = {}) {
        super(message);
        this.name = 'UsageApiError';
        this.statusCode = statusCode;
        this.payload = payload;
    }

    get isAuthError() {
        return this.statusCode === 401 || this.statusCode === 403;
    }
}

export class UsageApiClient {
    constructor() {
        this._session = new Soup.Session({
            timeout: 30,
        });
    }

    async fetchSummary(cookies) {
        // Step 1: Get the access token using the cookies
        let sessionData;
        try {
            sessionData = await this._getJson('/api/auth/session', cookies);
        } catch (e) {
            throw new UsageApiError('Failed to retrieve access token: ' + e.message);
        }
        
        if (!sessionData || !sessionData.accessToken) {
            throw new UsageApiError('Failed to retrieve access token from session. Cookies might be invalid.');
        }

        // Step 2: Use the access token to fetch usage
        const usagePayload = await this._getJsonWithAuth(SUMMARY_ENDPOINT, sessionData.accessToken);
        return this.normalizeSummary(usagePayload);
    }

    destroy() {
        this._session.abort();
    }

    async _getJson(path, cookies) {
        if (!cookies)
            throw new UsageApiError('Authentication cookies are required.');

        const message = Soup.Message.new('GET', `${API_BASE_URL}${path}`);
        const headers = message.get_request_headers();
        headers.append('Accept', 'application/json');
        headers.append('Cookie', cookies);
        headers.append('Referer', 'https://chatgpt.com/');
        headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        
        // Extract oai-did from cookies if present
        const match = cookies.match(/oai-did=([^;]+)/);
        if (match) {
            headers.append('oai-device-id', match[1]);
        }

        return this._executeRequest(message);
    }

    async _getJsonWithAuth(path, accessToken) {
        const message = Soup.Message.new('GET', `${API_BASE_URL}${path}`);
        const headers = message.get_request_headers();
        headers.append('Accept', 'application/json');
        headers.append('Authorization', `Bearer ${accessToken}`);
        headers.append('Referer', 'https://chatgpt.com/');
        headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

        return this._executeRequest(message);
    }

    async _executeRequest(message) {
        let bytes;
        try {
            bytes = await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
            );
        } catch (error) {
            throw new UsageApiError(error.message || String(error));
        }

        const statusCode = message.get_status();
        const body = new TextDecoder().decode(bytes?.toArray?.() ?? bytes?.get_data?.() ?? []);
        
        if (statusCode >= 400) {
            log(`CodexBar: API Error ${statusCode} - Body: ${body}`);
        }

        let payload = null;
        try {
            payload = body ? JSON.parse(body) : null;
        } catch (error) {
            if (statusCode >= 400) {
                throw new UsageApiError(`HTTP ${statusCode}: ${body.substring(0, 100)}`, { statusCode });
            }
            throw new UsageApiError(`Invalid JSON: ${error.message}`, { statusCode });
        }

        if (statusCode < 200 || statusCode >= 300) {
            let messageText = payload?.message || payload?.error?.message || payload?.error || `HTTP ${statusCode}`;
            if (typeof messageText === 'object') messageText = JSON.stringify(messageText);
            throw new UsageApiError(messageText, {statusCode, payload});
        }

        return payload;
    }


    normalizeSummary(payload) {
        // We want to return a structure compatible with what codexbar-cli returns if possible,
        // or at least what our extension expects.
        
        // Original extension expects:
        // { usage: { primary: { usedPercent: ... }, accountEmail: ... } }
        
        const windows = this.extractWindows(payload);
        const primary = windows.find(w => w.window_seconds === 5 * 3600) || windows[0];
        
        return {
            usage: {
                accountEmail: payload?.email || 'API User',
                updatedAt: new Date().toISOString(),
                primary: primary ? {
                    usedPercent: primary.percent * 100,
                    resetDescription: primary.reset_after_seconds ? `Resets in ${Math.round(primary.reset_after_seconds / 60)}m` : ''
                } : null,
                secondary: windows[1] ? {
                    usedPercent: windows[1].percent * 100,
                    resetDescription: windows[1].reset_after_seconds ? `Resets in ${Math.round(windows[1].reset_after_seconds / 3600)}h` : ''
                } : null,
                // Add more if needed
            }
        };
    }

    extractWindows(payload) {
        const windows = [];
        const collect = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            if (obj.used !== undefined && obj.limit !== undefined) {
                const limit = obj.limit || 1; // Avoid division by zero
                windows.push({
                    used: obj.used,
                    limit: obj.limit,
                    percent: obj.used / limit,
                    window_seconds: obj.window_seconds || obj.duration_seconds,
                    reset_after_seconds: obj.reset_after_seconds
                });
            }
            Object.values(obj).forEach(collect);
        };
        
        if (payload?.rate_limit) collect(payload.rate_limit);
        if (payload?.additional_rate_limits) collect(payload.additional_rate_limits);
        
        return windows.sort((a, b) => (a.window_seconds || 0) - (b.window_seconds || 0));
    }
}
