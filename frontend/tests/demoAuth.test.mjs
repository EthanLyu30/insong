import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
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

test("topbar switcher labels all demo identities and shows retryable errors", async () => {
  const entry = fileURLToPath(new URL("../src/DemoAccountSwitcher.tsx", import.meta.url));
  const source = await readFile(entry, "utf8");
  const compiled = await transformWithEsbuild(source, entry, {
    loader: "tsx", jsx: "transform", jsxFactory: "React.createElement", format: "cjs",
  });
  const componentModule = { exports: {} };
  new Function("React", "module", "exports", compiled.code)(React, componentModule, componentModule.exports);
  const { DemoAccountSwitcher } = componentModule.exports;
  const markup = renderToStaticMarkup(React.createElement(DemoAccountSwitcher, {
    identity: { user: null }, loading: false, error: "切换失败",
    onSwitch: async () => {}, onRetry: () => {},
  }));

  assert.match(markup, /演示帐号，仅用于黑客松功能验证/);
  assert.match(markup, /访客/);
  assert.match(markup, /小林/);
  assert.match(markup, /阿远/);
  assert.match(markup, /切换失败/);
  assert.match(markup, /重试/);
});
