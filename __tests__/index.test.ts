import * as core from "@actions/core";
import { execSync } from "child_process";
import { run } from "../src/index"; // Adjust path as needed

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("@actions/core");

describe("S3 Deploy GitHub Action", () => {
  const setFailedMock = jest.spyOn(core, "setFailed");
  const getInputMock = jest.spyOn(core, "getInput");

  beforeEach(() => {
    jest.clearAllMocks();
    getInputMock.mockImplementation((name: string) => {
      switch (name) {
        case "AWS_ACCESS_KEY_ID":
          return "test-access-key";
        case "AWS_SECRET_ACCESS_KEY":
          return "test-secret-key";
        case "AWS_S3_BUCKET":
          return "test-bucket";
        case "SOURCE_DIR":
          return "test-source-dir";
        case "AWS_REGION":
          return "us-east-1";
        case "CLOUDFRONT_DISTRIBUTION_ID":
          return "test-distribution-id";
        case "AWS_S3_PREFIX":
          return "test-prefix";
        case "AWS_S3_ENDPOINT":
          return "test-endpoint";
        default:
          return "";
      }
    });
  });

  it("fails the action if an error is thrown", async () => {
    const error = new Error("Test error");

    jest.mocked(execSync).mockImplementationOnce(() => {
      throw error;
    });

    await run();
    expect(setFailedMock).toHaveBeenCalledWith(
      `Action failed with error: ${error}`
    );
  });

  it("sets AWS environment variables correctly", async () => {
    await run();

    expect(process.env.AWS_ACCESS_KEY_ID).toBe("test-access-key");
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBe("test-secret-key");
    expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
    expect(process.env.AWS_S3_ENDPOINT).toBe("test-endpoint");
  });

  it("syncs files to S3 bucket with prefix", async () => {
    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync test-source-dir s3://test-bucket/test-prefix --acl public-read --no-progress`,
      { stdio: "inherit" }
    );
  });

  it("syncs files to S3 bucket without prefix", async () => {
    getInputMock.mockImplementation((name: string) => {
      switch (name) {
        case "AWS_ACCESS_KEY_ID":
          return "test-access-key";
        case "AWS_SECRET_ACCESS_KEY":
          return "test-secret-key";
        case "AWS_S3_BUCKET":
          return "test-bucket";
        case "SOURCE_DIR":
          return "test-source-dir";
        case "AWS_REGION":
          return "us-east-1";
        case "CLOUDFRONT_DISTRIBUTION_ID":
          return "test-distribution-id";
        case "AWS_S3_PREFIX":
          return "";
        case "AWS_S3_ENDPOINT":
          return "test-endpoint";
        default:
          return "";
      }
    });

    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync test-source-dir s3://test-bucket --acl public-read --no-progress`,
      { stdio: "inherit" }
    );
  });

  it("invalidates CloudFront cache if distribution ID is provided", async () => {
    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws cloudfront create-invalidation --distribution-id test-distribution-id --paths "/*"`,
      { stdio: "inherit" }
    );
  });

  it("does not invalidate CloudFront cache if distribution ID is not provided", async () => {
    getInputMock.mockImplementation((name: string) => {
      switch (name) {
        case "AWS_ACCESS_KEY_ID":
          return "test-access-key";
        case "AWS_SECRET_ACCESS_KEY":
          return "test-secret-key";
        case "AWS_S3_BUCKET":
          return "test-bucket";
        case "SOURCE_DIR":
          return "test-source-dir";
        case "AWS_REGION":
          return "us-east-1";
        case "CLOUDFRONT_DISTRIBUTION_ID":
          return "";
        case "AWS_S3_ENDPOINT":
          return "test-endpoint";
        default:
          return "";
      }
    });

    await run();

    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining("aws cloudfront create-invalidation"),
      expect.anything()
    );
  });
});
