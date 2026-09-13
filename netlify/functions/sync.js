// 継手 - 親子間の「開示する」を選んだ回答だけを一時的に中継する関数。
// 使い方:
//   POST { key, role: "parent"|"child", payload } -> 自分の内容を保存する
//   GET  ?key=...&role=parent|child               -> 相手（もう一方の役）の内容を取得する
//
// 保存する内容は、アプリ側で「開示する」を選んだ質問の本文だけに絞られたものが渡ってくる想定。
// この関数自身はその中身を検査しないが、キー(部屋コード)を知らない限り他人が読み書きできないことが
// プライバシーの拠り所になる。部屋コードは十分に長いランダム文字列としてアプリ側で生成している。

import { getStore } from "@netlify/blobs";

var STORE_NAME = "tsugite-sync";
var ROLES = ["parent", "child"];
var MAX_KEY_LEN = 64;
var MAX_BODY_BYTES = 200 * 1024; // 200KB あれば十分すぎるくらい余裕がある

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function isValidKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= MAX_KEY_LEN;
}

export default async (req) => {
  var store = getStore(STORE_NAME);

  if (req.method === "POST") {
    var raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
    var body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: "invalid json" }, 400); }

    var key = typeof body.key === "string" ? body.key.trim().toUpperCase() : "";
    var role = body.role;
    var payload = body.payload;
    if (!isValidKey(key)) return json({ error: "invalid key" }, 400);
    if (ROLES.indexOf(role) === -1) return json({ error: "invalid role" }, 400);
    if (!payload || typeof payload !== "object") return json({ error: "invalid payload" }, 400);

    var existing = (await store.get(key, { type: "json" })) || {};
    existing[role] = { payload: payload, at: Date.now() };
    await store.setJSON(key, existing);
    return json({ ok: true });
  }

  if (req.method === "GET") {
    var url = new URL(req.url);
    var key2 = (url.searchParams.get("key") || "").trim().toUpperCase();
    var role2 = url.searchParams.get("role");
    if (!isValidKey(key2)) return json({ error: "invalid key" }, 400);
    if (ROLES.indexOf(role2) === -1) return json({ error: "invalid role" }, 400);
    var peerRole = role2 === "parent" ? "child" : "parent";

    var data = await store.get(key2, { type: "json" });
    var peerEntry = data ? data[peerRole] : null;
    return json({ peer: peerEntry || null });
  }

  return json({ error: "method not allowed" }, 405);
};
