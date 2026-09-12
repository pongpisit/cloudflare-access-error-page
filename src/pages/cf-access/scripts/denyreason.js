const ACCESS_ERROR_TEXT = {
    10000: 'An unknown error occurred during sign-in',
    10001: 'No email address was provided for one-time PIN sign-in',
    10002: 'The one-time PIN has expired',
    10003: 'The one-time PIN has already been used',
    10201: 'An invalid client certificate (mTLS) was presented',
    10203: 'The session has expired',
    10204: 'Not authorized by any Access policy',
    10300: 'A SAML sign-in error occurred',
    10400: 'An identity provider (OAuth) sign-in error occurred'
};

function accessErrorText(code) {
    if (code === null || code === undefined) return null;
    if (ACCESS_ERROR_TEXT[code]) return ACCESS_ERROR_TEXT[code];
    if (code >= 10000 && code < 10100) return 'Sign-in error';
    if (code >= 10100 && code < 10300) return 'Access policy error';
    if (code >= 10300 && code < 10400) return 'SSO (SAML) error';
    if (code >= 10400 && code < 10500) return 'Identity provider (OAuth) error';
    return 'Cloudflare Access error';
}

async function getDenyReasonInfo(originalUrl) {
    const query = originalUrl ? '?original_url=' + encodeURIComponent(originalUrl) : '';
    const response = await fetch('/cf-access/api/denyreason' + query);
    if (!response.ok) {
        let code = null;
        try {
            const body = await response.json();
            code = body.code || null;
        } catch (parseError) {
            code = null;
        }
        const error = new Error('Deny reason fetch failed: ' + response.status);
        error.status = response.status;
        error.code = code;
        throw error;
    }
    return await response.json();
}
