import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getDemoIdentity, switchDemoIdentity } from "../src/demoAuth.ts";

const users = {
  1: { id: 1, display_name: "小林", is_demo: true },
  2: { id: 2, display_name: "阿远", is_demo: true },
};

function demoServer() {
  let currentUser = null;
  const requests = [];
  const request = async (url, options = {}) => {
    requests.push({ url, options });
    assert.equal(options.credentials, "include");
    if (url === "/api/me" && (!options.method || options.method === "GET")) {
      return Response.json({ user: currentUser });
    }
    if (url === "/api/demo/sessions" && options.method === "POST") {
      const { user_id } = JSON.parse(options.body);
      currentUser = users[user_id];
      return Response.json({ user: currentUser });
    }
    if (url === "/api/demo/logout" && options.method === "POST") {
      currentUser = null;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  };
  return { request, requests };
}

test("loads guest identity from server", async () => {
  const server = demoServer();
  assert.deepEqual(await getDemoIdentity("", server.request), { user: null });
  assert.equal(server.requests[0].url, "/api/me");
});

test("switching accounts and guest refreshes server identity", async () => {
  const server = demoServer();
  assert.deepEqual(await switchDemoIdentity("", 1, server.request), { user: users[1] });
  assert.deepEqual(await getDemoIdentity("", server.request), { user: users[1] });
  assert.deepEqual(await switchDemoIdentity("", 2, server.request), { user: users[2] });
  assert.deepEqual(await switchDemoIdentity("", null, server.request), { user: null });
  assert.deepEqual(server.requests.map(({ url }) => url), [
    "/api/demo/sessions", "/api/me", "/api/me", "/api/demo/sessions",
    "/api/me", "/api/demo/logout", "/api/me",
  ]);
});

test("failed login and logout surface Chinese errors", async () => {
  const rejected = async () => new Response(null, { status: 500 });
  await assert.rejects(switchDemoIdentity("", 1, rejected), /演示帐号切换失败/);
  await assert.rejects(switchDemoIdentity("", null, rejected), /退出演示帐号失败/);
});

test("network failures surface Chinese identity errors", async () => {
  const offline = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(getDemoIdentity("", offline), /当前演示帐号加载失败/);
  await assert.rejects(switchDemoIdentity("", 1, offline), /演示帐号切换失败/);
});

test("topbar switcher exposes the current identity and retryable errors", async () => {
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try {
  const { DemoAccountSwitcher } = await server.ssrLoadModule('/src/DemoAccountSwitcher.tsx');
  const markup = renderToStaticMarkup(React.createElement(DemoAccountSwitcher, {
    identity: { user: null }, loading: false, error: "切换失败",
    onSwitch: async () => {}, onRetry: () => {},
  }));

  assert.match(markup, /演示帐号，仅用于黑客松功能验证/);
  assert.match(markup, /访客/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /aria-label="切换演示帐号"/);
  assert.match(markup, /切换失败/);
  assert.match(markup, /重试/);
  } finally {await server.close();}
});
