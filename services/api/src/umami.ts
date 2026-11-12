/**
 * The Umami admin operations Orrery needs to provision a tenant.
 * Each tenant gets its own Umami team and a view-only user in that team,
 * so Umami itself refuses cross-tenant reads even if Orrery had a bug.
 */
export interface UmamiAdmin {
  createTeam(name: string): Promise<string>;
  createUser(username: string, password: string): Promise<string>;
  addTeamUser(teamId: string, userId: string): Promise<void>;
  deleteTeam(teamId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export function createUmamiAdmin(opts: {
  baseUrl: string;
  username: string;
  password: string;
  fetch?: typeof fetch;
}): UmamiAdmin {
  const doFetch = opts.fetch ?? fetch;
  let token: string | null = null;

  async function login(): Promise<string> {
    const res = await doFetch(`${opts.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: opts.username, password: opts.password }),
    });
    if (!res.ok) throw new Error(`Umami admin login failed with ${res.status}`);
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error("Umami admin login returned no token");
    return body.token;
  }

  async function call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    token ??= await login();
    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !retried) {
      token = null;
      return call<T>(method, path, body, true);
    }
    if (!res.ok) throw new Error(`Umami ${method} ${path} failed with ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    async createTeam(name) {
      // Umami answers with [team, teamUser].
      const result = await call<Array<{ id: string }>>("POST", "/api/teams", { name });
      const id = result?.[0]?.id;
      if (!id) throw new Error("Umami did not return a team id");
      return id;
    },
    async createUser(username, password) {
      const user = await call<{ id: string }>("POST", "/api/users", { username, password, role: "view-only" });
      return user.id;
    },
    async addTeamUser(teamId, userId) {
      await call("POST", `/api/teams/${teamId}/users`, { userId, role: "team-view-only" });
    },
    async deleteTeam(teamId) {
      await call("DELETE", `/api/teams/${teamId}`);
    },
    async deleteUser(userId) {
      await call("DELETE", `/api/users/${userId}`);
    },
  };
}
