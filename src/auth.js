// auth.js
export const generateCodeVerifier = () => {
    const array = new Uint8Array(128);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

export const generateCodeChallenge = async (codeVerifier) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

export const handleLogin = async (clientId, redirectUri, scopes) => {
    try {
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        localStorage.setItem('code_verifier', codeVerifier);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scopes,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            access_type: 'offline',
            prompt: 'consent',
        });

        window.location = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        console.log(window.location);
    } catch (error) {
        console.error('Error during login:', error);
        throw new Error('Failed to initiate login.');
    }
};