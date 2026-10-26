import test from "node:test";
import assert from "node:assert/strict";
import {providerResult} from "../server/provider-result.ts";
test("provider outcomes preserve pending, cached, and quarantined results",()=>{
  assert.equal(providerResult({status:"pending"}).status,"partial");
  assert.equal(providerResult({status:"cached"}).status,"succeeded");
  const result=providerResult({status:"completed_with_quarantine",quarantines:[{playerId:1}]});
  assert.equal(result.status,"partial");assert.deepEqual(result.details.quarantines,[{playerId:1}]);
  assert.throws(()=>providerResult({status:"unexpected"}));
  assert.throws(()=>providerResult({status:"synced",error:"failed"}));
});
