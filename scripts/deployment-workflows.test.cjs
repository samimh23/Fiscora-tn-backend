const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const workflow = (name) => readFileSync(join(__dirname, '..', '.github', 'workflows', name), 'utf8');

test('normal main releases remain enabled; first-image mode is opt-in after validation', () => {
  const ci = workflow('ci.yml');
  assert.match(ci, /bootstrap_image_only:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(ci, /needs: validate/);
  assert.match(ci, /if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(ci, /update_container_app: \$\{\{ inputs\.bootstrap_image_only != true \}\}/);
});

test('image-only bootstrap builds an image but skips all live deployment steps', () => {
  const deploy = workflow('deploy-azure-staging.yml');
  assert.match(deploy, /workflow_call:[\s\S]*?update_container_app:[\s\S]*?type: boolean[\s\S]*?default: true/);
  const steps = deploy.split(/\n\s+- name: /).slice(1);
  const gated = steps.filter((step) => /if: inputs\.update_container_app/.test(step));
  assert.equal(gated.length, 3);
  for (const name of ['Deploy the exact image revision', 'Wait for the exact image revision', 'Verify the deployed API']) {
    assert.ok(gated.some((step) => step.startsWith(name)), `${name} must be gated`);
  }
  for (const name of ['Build and push backend image', 'Resolve immutable image digest']) {
    const step = steps.find((value) => value.startsWith(name));
    assert.ok(step);
    assert.doesNotMatch(step, /if: inputs\.update_container_app/);
  }
  assert.match(deploy, /--container-name api/);
  assert.match(deploy, /fiscora-backend@\$digest/);
});

test('App Service cutover is opt-in and does not change the default legacy deployment', () => {
  const ci = workflow('ci.yml');
  assert.match(ci, /vars.AZURE_BACKEND_HOSTING == '' \|\| vars.AZURE_BACKEND_HOSTING == 'container-app'/);
  assert.match(ci, /vars.AZURE_BACKEND_HOSTING == 'app-service'/);
  assert.match(ci, /uses: .\/\.github\/workflows\/deploy-azure-app-service.yml/);
  assert.match(ci, /update_app_service: \$\{\{ inputs.bootstrap_image_only != true \}\}/);
});

test('App Service deployment never activates or deletes hosting and verifies the served SHA', () => {
  const deploy = workflow('deploy-azure-app-service.yml');
  const steps = deploy.split(/\n\s+- name: /).slice(1);
  const gated = steps.filter(step => /if: inputs.update_app_service/.test(step));
  assert.equal(gated.length, 3);
  assert.match(deploy, /Refuse to deploy to quarantined hosting/);
  assert.match(deploy, /\.startUpCommand == null or \.startUpCommand == ""/);
  assert.match(deploy, /--container-name api --image "\$EXPECTED_IMAGE"/);
  assert.match(deploy, /\.releaseSha == \$sha/);
  assert.match(deploy, /--build-arg APP_RELEASE_SHA=/);
  assert.doesNotMatch(deploy, /webapp (start|delete)|--startup-cmd|terraform apply|postgres.*(delete|migrate-network)/);
});
