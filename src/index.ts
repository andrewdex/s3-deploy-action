import * as core from "@actions/core";
import { execSync } from "child_process";
import { existsSync } from "fs";

function setAwsEnvVariables(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  endpoint?: string
) {
  process.env.AWS_ACCESS_KEY_ID = accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
  process.env.AWS_DEFAULT_REGION = region;
  if (endpoint) {
    process.env.AWS_S3_ENDPOINT = endpoint;
  }
}

function syncFilesToS3(
  bucketName: string,
  sourceDir: string,
  prefix: string,
  endpoint?: string,
  acl?: string,
  deleteRemoved?: boolean
) {
  try {
    const destination = prefix
      ? `s3://${bucketName}/${prefix}`
      : `s3://${bucketName}`;
    core.info(`Syncing files from ${sourceDir} to S3 bucket: ${destination}`);
    if (endpoint) {
      core.info(`Using endpoint: ${endpoint}`);
    }

    const commandParts = [
      `aws s3 sync "${sourceDir}" "${destination}" --no-progress`,
    ];

    if (acl) {
      commandParts.push(`--acl "${acl}"`);
    }

    if (endpoint) {
      commandParts.push(`--endpoint-url "${endpoint}"`);
    }

    if (deleteRemoved) {
      commandParts.push("--delete");
    }

    const command = commandParts.join(" ");
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    core.error("Error syncing files to S3");
    throw error;
  }
}

function invalidateCloudFrontCache(distributionId: string): string {
  try {
    core.info(`Invalidating CloudFront distribution: ${distributionId}`);
    const output = execSync(
      `aws cloudfront create-invalidation --distribution-id "${distributionId}" --paths "/*"`,
      { stdio: "pipe", encoding: "utf-8" }
    );
    core.info("CloudFront cache invalidation completed.");
    
    // Extract invalidation ID from output
    const invalidationMatch = output.match(/"Id":\s*"([^"]+)"/);
    return invalidationMatch ? invalidationMatch[1] : "";
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
    const deleteRemoved = core.getBooleanInput("DELETE_REMOVED") || false;

    // Validate source directory exists
    if (!existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    setAwsEnvVariables(accessKeyId, secretAccessKey, region, endpoint || undefined);

    syncFilesToS3(bucketName, sourceDir, prefix, endpoint || undefined, acl || undefined, deleteRemoved);

    // Set S3 URL output
    const s3Url = prefix
      ? `s3://${bucketName}/${prefix}`
      : `s3://${bucketName}`;
    core.setOutput("s3_url", s3Url);

    let invalidationId = "";
    if (cloudfrontDistributionId) {
      invalidationId = invalidateCloudFrontCache(cloudfrontDistributionId);
      if (invalidationId) {
        core.setOutput("cloudfront_invalidation_id", invalidationId);
      }
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

run();

export { run };
