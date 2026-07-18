export type Session = {
    accessJwt: string;
    refreshJwt: string;
    did: string;
    handle: string;
    email: string;
    emailConfirmed: boolean;
    active: boolean;
    wsocialVerified: string;
};
export type LoginOptions = {
    identifier: string | undefined;
    password: string | undefined;
};
//# sourceMappingURL=types.d.ts.map