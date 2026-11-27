const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");

process.env.ADMIN_API_TOKEN = "dataset-integration-test-token";
const app = require("../src/app");
const projectRoot = path.resolve(__dirname, "../..");
const samplePath = path.join(projectRoot, "processing-engine/data/input/sample.csv");
const outputRoot = path.join(projectRoot, "processing-engine/data/output");
const generatedFiles = [
  "cleaned.csv", "train.csv", "validation.csv", "test.csv",
  "schema.json", "metadata.json", "preprocessing_report.json", "data_quality_issues.csv", "rejected_rows.csv",
];

let server;
let baseUrl;
let jobId;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = "http://127.0.0.1:" + server.address().port + "/api/v1/datasets";
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (jobId) fs.rmSync(path.join(outputRoot, jobId), { recursive: true, force: true });
});

const auth = () => ({ "x-admin-token": process.env.ADMIN_API_TOKEN });

test("dataset routes require admin authentication", async () => {
  const response = await fetch(baseUrl + "/upload", { method: "POST" });
  assert.equal(response.status, 401);
});

test("upload runs the processor and creates all nine job outputs", async () => {
  const body = new FormData();
  body.append("file", new Blob([fs.readFileSync(samplePath)]), "sample.csv");
  const response = await fetch(baseUrl + "/upload", {
    method: "POST",
    headers: auth(),
    body,
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.success, true);
  assert.match(result.jobId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(result.generatedFiles, generatedFiles);
  assert.equal(result.results.metadata.total_records, 5);
  assert.equal(result.results.report.duplicate_records_removed, 1);
  assert.equal(result.results.report.rows_flagged, 2);
  jobId = result.jobId;

  for (const filename of generatedFiles) {
    assert.ok(fs.existsSync(path.join(outputRoot, jobId, filename)), filename + " exists");
  }
});

test("job result retrieval and safe file download work for an authenticated admin", async () => {
  const resultResponse = await fetch(baseUrl + "/" + jobId, { headers: auth() });
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.deepEqual(result.generatedFiles, generatedFiles);

  const fileResponse = await fetch(baseUrl + "/" + jobId + "/files/cleaned.csv", {
    headers: auth(),
  });
  assert.equal(fileResponse.status, 200);
  assert.match(await fileResponse.text(), /Mina,24(?:\.0+)?,,40000(?:\.0+)?/);

  const issuesResponse = await fetch(baseUrl + "/" + jobId + "/files/data_quality_issues.csv", {
    headers: auth(),
  });
  assert.equal(issuesResponse.status, 200);
  assert.match(await issuesResponse.text(), /missing_value/);

  const rejectedResponse = await fetch(baseUrl + "/" + jobId + "/files/rejected_rows.csv", {
    headers: auth(),
  });
  assert.equal(rejectedResponse.status, 200);
  assert.match(await rejectedResponse.text(), /duplicate row\/key/);

  const unsafeResponse = await fetch(
    baseUrl + "/" + jobId + "/files/%2E%2E%2F%2E%2E%2Fbackend%2Fpackage.json",
    { headers: auth() },
  );
  assert.equal(unsafeResponse.status, 404);
});

test("non-CSV uploads are rejected", async () => {
  const body = new FormData();
  body.append("file", new Blob(["not csv"]), "notes.txt");
  const response = await fetch(baseUrl + "/upload", {
    method: "POST",
    headers: auth(),
    body,
  });
  assert.equal(response.status, 400);
});

test("admin token verification accepts the configured token and rejects another value", async () => {
  const endpoint = baseUrl.replace("/datasets", "/auth/verify");
  const accepted = await fetch(endpoint, { method: "POST", headers: auth() });
  assert.equal(accepted.status, 200);

  const rejected = await fetch(endpoint, {
    method: "POST",
    headers: { "x-admin-token": "wrong-demo-token" },
  });
  assert.equal(rejected.status, 401);
});
