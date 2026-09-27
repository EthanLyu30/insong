export type DemoUser = {
  id: number;
  display_name: string;
  is_demo: boolean;
};

export type DemoIdentity = { user: DemoUser | null };

export async function getDemoIdentity(
  baseUrl: string,
  request: typeof fetch = fetch,
): Promise<DemoIdentity> {
  try {
    const response = await request(`${baseUrl}/api/me`, { credentials: "include" });
    if (!response.ok) {
      throw new Error("当前演示帐号加载失败，请重试。");
    }
    return (await response.json()) as DemoIdentity;
  } catch {
    throw new Error("当前演示帐号加载失败，请重试。");
  }
}

export async function switchDemoIdentity(
  baseUrl: string,
  userId: 1 | 2 | null,
  request: typeof fetch = fetch,
): Promise<DemoIdentity> {
  const loggingOut = userId === null;
  let response: Response;
  try {
    response = await request(
      `${baseUrl}/api/demo/${loggingOut ? "logout" : "sessions"}`,
      {
        method: "POST",
        credentials: "include",
        ...(loggingOut ? {} : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }),
      },
    );
  } catch {
    throw new Error(loggingOut ? "退出演示帐号失败，请重试。" : "演示帐号切换失败，请重试。");
  }
  if (!response.ok) {
    throw new Error(loggingOut ? "退出演示帐号失败，请重试。" : "演示帐号切换失败，请重试。");
  }
  return getDemoIdentity(baseUrl, request);
}
