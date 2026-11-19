import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { VolcengineUsagePlugin } from "../index.mjs"

const LEGACY = "volcengine-apigw-anthropic"
const SPEC = "github:CrazyTomatoOo/volcengine-apigw-usage"

function configDir(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "volcengine-apigw-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(body))
  }
  return dir
}

async function load(dir) {
  const removed = []
  const client = {
    auth: {
      remove: async ({ path }) => {
        removed.push(path.id)
      },
    },
  }
  await VolcengineUsagePlugin({ client, directory: dir })
  return removed
}

test("retires the legacy Anthropic provider left in the plugin listing", async (t) => {
  const dir = configDir(t, {
    "plugin-providers.json": [{ id: LEGACY, spec: SPEC, name: "火山引擎 APIG 网关 (Anthropic)" }],
  })

  assert.deepEqual(await load(dir), [LEGACY])
})

test("removes every legacy Anthropic sign-in", async (t) => {
  const dir = configDir(t, {
    "plugin-auth.json": {
      [LEGACY]: { type: "api", key: "old" },
      [`${LEGACY}#second`]: { type: "api", key: "older" },
    },
  })

  assert.deepEqual((await load(dir)).sort(), [LEGACY, `${LEGACY}#second`].sort())
})

test("leaves the current provider alone", async (t) => {
  const dir = configDir(t, {
    "plugin-providers.json": [{ id: "volcengine-apigw", spec: SPEC, name: "火山引擎 APIG 网关 (OpenAI)" }],
  })

  assert.deepEqual(await load(dir), [])
})

test("does nothing when magpie's config folder cannot be read", async () => {
  assert.deepEqual(await load("/nonexistent/volcengine-apigw"), [])
})
