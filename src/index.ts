import * as core from "@actions/core";
import { execSync } from "child_process";

function setAwsEnvVariables(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  endpoint?: string
) {
  process.env.AWS_ACCESS_KEY_ID = accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
  process.env.AWS_DEFAULT_REGION = region;
  process.env.AWS_S3_ENDPOINT = endpoint;
}

function syncFilesToS3(
  bucketName: string,
  sourceDir: string,
  prefix: string,
  endpoint?: string,
  acl?: string
) {
  try {
    const destination = prefix
      ? `s3://${bucketName}/${prefix}`
      : `s3://${bucketName}`;
    console.log(`Syncing files from ${sourceDir} to S3 bucket: ${destination}`);
    console.log(`Using endpoint: ${endpoint}`);

    const commandParts = [
      `aws s3 sync ${sourceDir} ${destination} --no-progress`,
    ];

    if (acl) {
      commandParts.push(`--acl ${acl}`);
    }

    if (endpoint) {
      commandParts.push(`--endpoint-url ${endpoint}`);
    }

    const command = commandParts.join(" ");
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    core.error("Error syncing files to S3");
    throw error;
  }
}

function invalidateCloudFrontCache(distributionId: string) {
  try {
    console.log(`Invalidating CloudFront distribution: ${distributionId}`);
    execSync(
      `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths "/*"`,
      { stdio: "inherit" }
    );
    console.log("CloudFront cache invalidation completed.");
  } catch (error) {
    core.error("Error invalidating CloudFront cache");
    throw error;
  }
}

async function run() {
  try {
    const accessKeyId = core.getInput("AWS_ACCESS_KEY_ID", { required: true });
    const secretAccessKey = core.getInput("AWS_SECRET_ACCESS_KEY", {
      required: true,
    });
    const bucketName = core.getInput("AWS_S3_BUCKET", { required: true });
    const sourceDir = core.getInput("SOURCE_DIR") || ".";
    const region = core.getInput("AWS_REGION") || "us-east-1";
    const cloudfrontDistributionId = core.getInput(
      "CLOUDFRONT_DISTRIBUTION_ID"
    );
    const prefix = core.getInput("AWS_S3_PREFIX") || "";
    const endpoint = core.getInput("AWS_S3_ENDPOINT") || "";
    const acl = core.getInput("AWS_S3_ACL") || "";

    setAwsEnvVariables(accessKeyId, secretAccessKey, region, endpoint);

    syncFilesToS3(bucketName, sourceDir, prefix, endpoint, acl);

    if (cloudfrontDistributionId) {
      invalidateCloudFrontCache(cloudfrontDistributionId);
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

run();

export { run };
