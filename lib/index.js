"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = require("@actions/core");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
function setAwsEnvVariables(accessKeyId, secretAccessKey, region, endpoint) {
    process.env.AWS_ACCESS_KEY_ID = accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
    process.env.AWS_DEFAULT_REGION = region;
    if (endpoint) {
        process.env.AWS_S3_ENDPOINT = endpoint;
    }
    else {
        delete process.env.AWS_S3_ENDPOINT;
    }
}
function syncFilesToS3(bucketName, sourceDir, prefix, endpoint, acl, deleteRemoved) {
    try {
        const destination = prefix
            ? `s3://${bucketName}/${prefix}`
            : `s3://${bucketName}`;
        core.info(`Syncing files from ${sourceDir} to S3 bucket: ${destination}`);
        if (endpoint) {
            core.info(`Using endpoint: ${endpoint}`);
        }
        const args = ["s3", "sync", sourceDir, destination, "--no-progress"];
        if (acl) {
            args.push("--acl", acl);
        }
        if (endpoint) {
            args.push("--endpoint-url", endpoint);
        }
        if (deleteRemoved) {
            args.push("--delete");
        }
        (0, child_process_1.execFileSync)("aws", args, { shell: false, stdio: "inherit" });
    }
    catch (error) {
        core.error("Error syncing files to S3");
        throw error;
    }
}
function invalidateCloudFrontCache(distributionId) {
    try {
        core.info(`Invalidating CloudFront distribution: ${distributionId}`);
        const output = (0, child_process_1.execFileSync)("aws", [
            "cloudfront",
            "create-invalidation",
            "--distribution-id",
            distributionId,
            "--paths",
            "/*",
        ], { encoding: "utf-8", shell: false, stdio: "pipe" });
        core.info("CloudFront cache invalidation completed.");
        // Extract invalidation ID from output
        const invalidationMatch = output.match(/"Id":\s*"([^"]+)"/);
        return invalidationMatch ? invalidationMatch[1] : "";
    }
    catch (error) {
        core.error("Error invalidating CloudFront cache");
        throw error;
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const accessKeyId = core.getInput("AWS_ACCESS_KEY_ID", { required: true });
            const secretAccessKey = core.getInput("AWS_SECRET_ACCESS_KEY", {
                required: true,
            });
            const bucketName = core.getInput("AWS_S3_BUCKET", { required: true });
            const sourceDir = core.getInput("SOURCE_DIR") || ".";
            const region = core.getInput("AWS_REGION") || "us-east-1";
            const cloudfrontDistributionId = core.getInput("CLOUDFRONT_DISTRIBUTION_ID");
            const prefix = core.getInput("AWS_S3_PREFIX") || "";
            const endpoint = core.getInput("AWS_S3_ENDPOINT") || "";
            const acl = core.getInput("AWS_S3_ACL") || "";
            const deleteRemoved = core.getBooleanInput("DELETE_REMOVED") || false;
            // Validate source directory exists
            if (!(0, fs_1.existsSync)(sourceDir)) {
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
        }
        catch (error) {
            core.setFailed(`Action failed with error: ${error}`);
        }
    });
}
if (require.main === module) {
    void run();
}
