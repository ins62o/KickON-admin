#!/usr/bin/env bash
set -euo pipefail

# This publisher is intentionally limited to the existing KICKON Admin site.
test "${GITHUB_REF:-}" = 'refs/heads/Prod'
test "${SITE_URL%/}" = 'https://admin.kickon.kr'
test "${S3_BUCKET:-}" = 'kickon-admin'
test "${DISTRIBUTION_ID:-}" = 'E13XNKB0IQ56OZ'
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ ]]
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]
[[ "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]
test -d "$RUNNER_TEMP"
node scripts/verify-deploy-artifact.mjs
node --input-type=module -e '
  import assert from "node:assert/strict";
  import {readFileSync} from "node:fs";
  const build=JSON.parse(readFileSync("dist/build-info.json","utf8"));
  assert.equal(build.commit,process.env.GITHUB_SHA);
  assert.equal(build.run,process.env.GITHUB_RUN_ID);
'
test "$(aws sts get-caller-identity --query Account --output text)" = '896421757212'

# Never prune assets: open tabs and the previous release must remain usable.
# Attempts have separate backups, so a deliberate rerun cannot overwrite them.
backup="s3://$S3_BUCKET/releases/$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
aws s3 cp "s3://$S3_BUCKET/index.html" "$backup/index.html" --only-show-errors
aws s3 cp "s3://$S3_BUCKET/build-info.json" "$backup/build-info.json" --only-show-errors
aws s3 sync dist/assets/ "s3://$S3_BUCKET/assets/" \
  --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws s3 sync dist/ "s3://$S3_BUCKET/" \
  --exclude 'assets/*' --exclude 'index.html' --exclude 'build-info.json' \
  --cache-control 'no-cache,max-age=0,must-revalidate' --only-show-errors
aws s3 cp dist/build-info.json "s3://$S3_BUCKET/build-info.json" \
  --content-type 'application/json' --cache-control 'no-cache,max-age=0,must-revalidate' --only-show-errors
aws s3 cp dist/index.html "s3://$S3_BUCKET/index.html" \
  --content-type 'text/html' --cache-control 'no-cache,max-age=0,must-revalidate' --only-show-errors

invalidation_id="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' --query Invalidation.Id --output text)"
echo "CloudFront invalidation: $invalidation_id"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$invalidation_id"

site="${SITE_URL%/}"
curl --fail --silent --show-error --compressed --max-time 30 "$site/" -o "$RUNNER_TEMP/published.html"
cmp dist/index.html "$RUNNER_TEMP/published.html"
curl --fail --silent --show-error --compressed --max-time 30 "$site/build-info.json" -o "$RUNNER_TEMP/published-build.json"
cmp dist/build-info.json "$RUNNER_TEMP/published-build.json"
node --input-type=module -e '
  import {readFileSync} from "node:fs";
  const html=readFileSync("dist/index.html","utf8");
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.(?:js|css))"/g)].map(match=>match[1]);
  if(!assets.some(asset=>asset.endsWith(".js"))||!assets.some(asset=>asset.endsWith(".css")))throw Error("Missing entry assets");
  console.log([...new Set(assets)].join("\n"));
' > "$RUNNER_TEMP/entry-assets.txt"
while IFS= read -r asset; do
  curl --fail --silent --show-error --compressed --max-time 30 "$site$asset" -o "$RUNNER_TEMP/published-asset"
  cmp "dist$asset" "$RUNNER_TEMP/published-asset"
done < "$RUNNER_TEMP/entry-assets.txt"
{
  echo "Deployed $GITHUB_SHA to $site"
  echo "Verified the published HTML, build metadata, JavaScript and CSS byte for byte."
  echo "Previous entry and build metadata: $backup"
} >> "$GITHUB_STEP_SUMMARY"
