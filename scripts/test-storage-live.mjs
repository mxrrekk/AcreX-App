import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const userAEmail = process.env.ACREX_TEST_USER_A_EMAIL;
const userAPassword = process.env.ACREX_TEST_USER_A_PASSWORD;
const userBEmail = process.env.ACREX_TEST_USER_B_EMAIL;
const userBPassword = process.env.ACREX_TEST_USER_B_PASSWORD;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["ACREX_TEST_USER_A_EMAIL", userAEmail],
  ["ACREX_TEST_USER_A_PASSWORD", userAPassword],
  ["ACREX_TEST_USER_B_EMAIL", userBEmail],
  ["ACREX_TEST_USER_B_PASSWORD", userBPassword]
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing live storage test variables: ${missing.join(", ")}`);
  process.exit(1);
}

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function signIn(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(error?.message ?? `Could not sign in ${email}`);
  return { supabase, user: data.user };
}

function expected(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const marker = `storage-test-${Date.now()}`;
const { supabase: userA, user: accountA } = await signIn(userAEmail, userAPassword);
const { supabase: userB, user: accountB } = await signIn(userBEmail, userBPassword);
assert.notEqual(accountA.id, accountB.id, "Test accounts must be different users.");

let projectId = null;
let quoteId = null;
let invoiceId = null;
let attachmentId = null;
let storagePath = null;

try {
  const { data: project, error: projectError } = await userA
    .from("projects")
    .insert({
      user_id: accountA.id,
      project_name: marker,
      address: "Storage acceptance test",
      polygon_geojson: { type: "FeatureCollection", features: [] }
    })
    .select("*")
    .single();
  expected(projectError, "Save project");
  projectId = project.id;

  const drawingId = `${marker}-drawing`;
  const geometry = {
    type: "Feature",
    id: drawingId,
    properties: { zoneName: "Test Area", zoneType: "Grass" },
    geometry: {
      type: "Polygon",
      coordinates: [[[-87.7, 30.6], [-87.699, 30.6], [-87.699, 30.601], [-87.7, 30.6]]]
    }
  };
  const { error: drawingError } = await userA.from("drawings").insert({
    id: drawingId,
    user_id: accountA.id,
    project_id: projectId,
    name: "Test Area",
    service_type: "Mowing",
    zone_type: "Grass",
    geometry_type: "polygon",
    geometry_geojson: geometry,
    unit: "acres",
    quantity: 0.25
  });
  expected(drawingError, "Save drawing");

  const { error: measurementError } = await userA.from("measurements").insert({
    user_id: accountA.id,
    project_id: projectId,
    drawing_id: drawingId,
    quantity: 0.25,
    unit: "acres",
    area_acres: 0.25
  });
  expected(measurementError, "Save measurement");

  const { data: quote, error: quoteError } = await userA
    .from("quotes")
    .insert({
      user_id: accountA.id,
      project_id: projectId,
      quote_number: marker,
      status: "Draft",
      project_name: marker,
      subtotal: 30,
      total: 30
    })
    .select("*")
    .single();
  expected(quoteError, "Save quote");
  quoteId = quote.id;

  const { data: quoteLine, error: quoteLineError } = await userA
    .from("quote_line_items")
    .insert({
      user_id: accountA.id,
      project_id: projectId,
      quote_id: quoteId,
      drawing_id: drawingId,
      service: "Mowing",
      quantity: 0.25,
      unit: "acres",
      unit_price: 120,
      total: 30
    })
    .select("id")
    .single();
  expected(quoteLineError, "Save quote line");

  const { data: invoice, error: invoiceError } = await userA
    .from("invoices")
    .insert({
      user_id: accountA.id,
      project_id: projectId,
      quote_id: quoteId,
      invoice_number: marker,
      status: "Draft",
      project_name: marker,
      total: 30
    })
    .select("*")
    .single();
  expected(invoiceError, "Save invoice");
  invoiceId = invoice.id;

  const { error: invoiceLineError } = await userA.from("invoice_line_items").insert({
    user_id: accountA.id,
    project_id: projectId,
    invoice_id: invoiceId,
    quote_line_item_id: quoteLine.id,
    name: "Mowing",
    quantity: 0.25,
    unit: "acres",
    unit_price: 120,
    total: 30
  });
  expected(invoiceLineError, "Save invoice line");

  storagePath = `${accountA.id}/projects/${projectId}/${marker}.txt`;
  const file = new Blob(["AcreX private storage acceptance test"], { type: "text/plain" });
  const { error: uploadError } = await userA.storage.from("acrex-files").upload(storagePath, file);
  expected(uploadError, "Upload project file");

  const { data: attachment, error: attachmentError } = await userA
    .from("attachments")
    .insert({
      user_id: accountA.id,
      project_id: projectId,
      file_type: "test_document",
      file_name: `${marker}.txt`,
      storage_path: storagePath,
      mime_type: "text/plain",
      file_size: file.size,
      is_public: false
    })
    .select("*")
    .single();
  expected(attachmentError, "Save attachment metadata");
  attachmentId = attachment.id;

  const { data: reloadedProject, error: reloadProjectError } = await userA
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  expected(reloadProjectError, "Reload project");
  assert.equal(reloadedProject.id, projectId);

  const { data: reloadedQuote, error: reloadQuoteError } = await userA
    .from("quotes")
    .select("id")
    .eq("id", quoteId)
    .single();
  expected(reloadQuoteError, "Reload quote");
  assert.equal(reloadedQuote.id, quoteId);

  const { data: reloadedInvoice, error: reloadInvoiceError } = await userA
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .single();
  expected(reloadInvoiceError, "Reload invoice");
  assert.equal(reloadedInvoice.id, invoiceId);

  const { data: downloaded, error: downloadError } = await userA.storage
    .from("acrex-files")
    .download(storagePath);
  expected(downloadError, "Download own private file");
  assert.match(await downloaded.text(), /AcreX private storage acceptance test/);

  const foreignChecks = await Promise.all([
    userB.from("projects").select("id").eq("id", projectId),
    userB.from("drawings").select("id").eq("project_id", projectId),
    userB.from("quotes").select("id").eq("id", quoteId),
    userB.from("invoices").select("id").eq("id", invoiceId),
    userB.from("attachments").select("id").eq("id", attachmentId)
  ]);
  foreignChecks.forEach((result, index) => {
    expected(result.error, `Isolation query ${index + 1}`);
    assert.equal(result.data.length, 0, `User B could see User A data in isolation query ${index + 1}`);
  });
  const { data: foreignFile, error: foreignDownloadError } = await userB.storage
    .from("acrex-files")
    .download(storagePath);
  assert.equal(foreignFile, null);
  assert.ok(foreignDownloadError, "User B unexpectedly downloaded User A private file.");

  console.log("Live project, drawing, quote, invoice, file persistence, refresh reads, and user isolation passed.");
} finally {
  if (storagePath) await userA.storage.from("acrex-files").remove([storagePath]);
  if (invoiceId) await userA.from("invoices").delete().eq("id", invoiceId).eq("user_id", accountA.id);
  if (quoteId) await userA.from("quotes").delete().eq("id", quoteId).eq("user_id", accountA.id);
  if (projectId) await userA.from("projects").delete().eq("id", projectId).eq("user_id", accountA.id);
  await userA.auth.signOut();
  await userB.auth.signOut();
}
