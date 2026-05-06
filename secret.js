import Secret from 'gi://Secret';

const SECRET_SCHEMA_NAME = 'org.gnome.shell.extensions.codexbar.token';

const TOKEN_SCHEMA = new Secret.Schema(
    SECRET_SCHEMA_NAME,
    Secret.SchemaFlags.NONE,
    {provider_id: Secret.SchemaAttributeType.STRING},
);

export function storeToken(providerId, token) {
    return Secret.password_store_sync(
        TOKEN_SCHEMA,
        {provider_id: providerId},
        Secret.COLLECTION_DEFAULT,
        `CodexBar token for ${providerId}`,
        token,
        null,
    );
}

export function loadToken(providerId) {
    return Secret.password_lookup_sync(TOKEN_SCHEMA, {provider_id: providerId}, null);
}

export function clearToken(providerId) {
    return Secret.password_clear_sync(TOKEN_SCHEMA, {provider_id: providerId}, null);
}
