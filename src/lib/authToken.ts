let _token: string | null = null;

export const setAuthToken = (token: string | null) => { _token = token; };
export const getAuthToken = () => _token;
