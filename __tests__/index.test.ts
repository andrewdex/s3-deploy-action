import * as core from "@actions/core";
import { execSync } from "child_process";
import * as fs from "fs";
import { run } from "../src/index";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("@actions/core");

describe("S3 Deploy GitHub Action", () => {
  const setFailedMock = jest.spyOn(core, "setFailed");
  const getInputMock = jest.spyOn(core, "getInput");
  const getBooleanInputMock = jest.spyOn(core, "getBooleanInput");
  const setOutputMock = jest.spyOn(core, "setOutput");
  const infoMock = jest.spyOn(core, "info");
  const errorMock = jest.spyOn(core, "error");
  const existsSyncSpy = jest.spyOn(fs, "existsSync");

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

  const defaultDeleteRemoved = false;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_S3_ENDPOINT;

    // Mock existsSync to return true by default
    existsSyncSpy.mockReturnValue(true);

    getInputMock.mockImplementation((name: string) => {
      return defaultInputs[name] || "";
    });

    getBooleanInputMock.mockImplementation((name: string) => {
      if (name === "DELETE_REMOVED") {
        return defaultDeleteRemoved;
      }
      return false;
    });

    // Mock execSync to return valid CloudFront output
    jest.mocked(execSync).mockImplementation((command: string, options?: any) => {
      if (command.includes("cloudfront create-invalidation")) {
        // When encoding is specified, execSync returns a string
        return '{"Invalidation":{"Id":"INVALIDATION123"}}';
      }
      return Buffer.from("");
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

  it("does not set AWS_S3_ENDPOINT when empty", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
      return inputs[name as keyof typeof inputs] || "";
    });

    await run();

    expect(process.env.AWS_S3_ENDPOINT).toBeUndefined();
  });

  it("syncs files to S3 bucket with prefix", async () => {
    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --acl "public-read" --endpoint-url "test-endpoint"`,
      { stdio: "inherit" }
    );
  });

  it("syncs files to S3 bucket without prefix", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_PREFIX: "" };
      return inputs[name] || "";
    });

    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync "test-source-dir" "s3://test-bucket" --no-progress --acl "public-read" --endpoint-url "test-endpoint"`,
      { stdio: "inherit" }
    );
  });

  it("syncs files to S3 bucket without ACL when not provided", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_ACL: "" };
      return inputs[name] || "";
    });

    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --endpoint-url "test-endpoint"`,
      { stdio: "inherit" }
    );
  });

  it("invalidates CloudFront cache if distribution ID is provided", async () => {
    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws cloudfront create-invalidation --distribution-id "test-distribution-id" --paths "/*"`,
      { stdio: "pipe", encoding: "utf-8" }
    );
    expect(setOutputMock).toHaveBeenCalledWith("cloudfront_invalidation_id", "INVALIDATION123");
  });

  it("does not invalidate CloudFront cache if distribution ID is not provided", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs: Record<string, string> = { ...defaultInputs, CLOUDFRONT_DISTRIBUTION_ID: "" };
      return inputs[name] || "";
    });

    await run();

    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining("aws cloudfront create-invalidation"),
      expect.anything()
    );
  });

  describe("Input validation and defaults", () => {
    it("uses default SOURCE_DIR when not provided", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, SOURCE_DIR: "" };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('aws s3 sync "." "s3://'),
        expect.anything()
      );
    });

    it("validates source directory exists", async () => {
      existsSyncSpy.mockReturnValueOnce(false);
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, SOURCE_DIR: "nonexistent-dir" };
        return inputs[name] || "";
      });

      await run();

      expect(setFailedMock).toHaveBeenCalledWith(
        expect.stringContaining("Source directory does not exist: nonexistent-dir")
      );
    });

    it("uses default AWS_REGION when not provided", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_REGION: "" };
        return inputs[name] || "";
      });

      await run();

      expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
    });

    it("handles empty AWS_S3_ENDPOINT correctly", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        'aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --acl "public-read"',
        { stdio: "inherit" }
      );
      expect(process.env.AWS_S3_ENDPOINT).toBeUndefined();
    });

    it("handles various ACL values", async () => {
      const aclValues = [
        "private",
        "public-read",
        "public-read-write",
        "authenticated-read",
      ];

      for (const acl of aclValues) {
        jest.clearAllMocks();
        existsSyncSpy.mockReturnValue(true);
        jest.mocked(execSync).mockImplementation((command: string, options?: any) => {
          if (command.includes("cloudfront create-invalidation")) {
            return '{"Invalidation":{"Id":"INVALIDATION123"}}';
          }
          return Buffer.from("");
        });
        getInputMock.mockImplementation((name: string) => {
          const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_ACL: acl };
          return inputs[name] || "";
        });

        await run();

        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining(`--acl "${acl}"`),
          expect.anything()
        );
      }
    });

    it("handles DELETE_REMOVED input", async () => {
      getBooleanInputMock.mockImplementation((name: string) => {
        if (name === "DELETE_REMOVED") {
          return true;
        }
        return false;
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("--delete"),
        expect.anything()
      );
    });
  });

  describe("Error handling", () => {
    it("handles S3 sync errors and calls core.error", async () => {
      const syncError = new Error("S3 sync failed");
      jest.mocked(execSync).mockImplementationOnce(() => {
        throw syncError;
      });

      await run();

      expect(errorMock).toHaveBeenCalledWith("Error syncing files to S3");
      expect(setFailedMock).toHaveBeenCalledWith(
        `Action failed with error: ${syncError}`
      );
    });

    it("handles CloudFront invalidation errors", async () => {
      const invalidationError = new Error("CloudFront invalidation failed");
      jest
        .mocked(execSync)
        .mockImplementationOnce(() => Buffer.from("")) // S3 sync succeeds
        .mockImplementationOnce(() => {
          // CloudFront invalidation fails
          throw invalidationError;
        });

      await run();

      expect(errorMock).toHaveBeenCalledWith(
        "Error invalidating CloudFront cache"
      );
      expect(setFailedMock).toHaveBeenCalledWith(
        `Action failed with error: ${invalidationError}`
      );
    });

    it("handles missing required inputs gracefully", async () => {
      // Mock core.getInput to throw for required inputs
      getInputMock.mockImplementation((name: string, options?: any) => {
        if (options?.required && name === "AWS_ACCESS_KEY_ID") {
          throw new Error("Input required and not supplied: AWS_ACCESS_KEY_ID");
        }
        return defaultInputs[name] || "";
      });

      await run();

      expect(setFailedMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "Input required and not supplied: AWS_ACCESS_KEY_ID"
        )
      );
    });
  });

  describe("Logging output", () => {
    it("logs sync operation details", async () => {
      await run();

      expect(infoMock).toHaveBeenCalledWith(
        "Syncing files from test-source-dir to S3 bucket: s3://test-bucket/test-prefix"
      );
      expect(infoMock).toHaveBeenCalledWith(
        "Using endpoint: test-endpoint"
      );
    });

    it("does not log endpoint when not provided", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
        return inputs[name] || "";
      });

      await run();

      expect(infoMock).not.toHaveBeenCalledWith(
        expect.stringContaining("Using endpoint:")
      );
    });

    it("logs CloudFront invalidation details", async () => {
      await run();

      expect(infoMock).toHaveBeenCalledWith(
        "Invalidating CloudFront distribution: test-distribution-id"
      );
      expect(infoMock).toHaveBeenCalledWith(
        "CloudFront cache invalidation completed."
      );
    });

    it("logs correct S3 destination without prefix", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_PREFIX: "" };
        return inputs[name] || "";
      });

      await run();

      expect(infoMock).toHaveBeenCalledWith(
        "Syncing files from test-source-dir to S3 bucket: s3://test-bucket"
      );
    });
  });

  describe("Action outputs", () => {
    it("sets s3_url output", async () => {
      await run();

      expect(setOutputMock).toHaveBeenCalledWith(
        "s3_url",
        "s3://test-bucket/test-prefix"
      );
    });

    it("sets s3_url output without prefix", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_PREFIX: "" };
        return inputs[name] || "";
      });

      await run();

      expect(setOutputMock).toHaveBeenCalledWith(
        "s3_url",
        "s3://test-bucket"
      );
    });

    it("sets cloudfront_invalidation_id output when provided", async () => {
      await run();

      expect(setOutputMock).toHaveBeenCalledWith(
        "cloudfront_invalidation_id",
        "INVALIDATION123"
      );
    });

    it("does not set cloudfront_invalidation_id when distribution ID not provided", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, CLOUDFRONT_DISTRIBUTION_ID: "" };
        return inputs[name] || "";
      });

      await run();

      expect(setOutputMock).not.toHaveBeenCalledWith(
        "cloudfront_invalidation_id",
        expect.anything()
      );
    });
  });

  describe("Command construction", () => {
    it("constructs command with all optional parameters", async () => {
      await run();

      expect(execSync).toHaveBeenCalledWith(
        'aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --acl "public-read" --endpoint-url "test-endpoint"',
        { stdio: "inherit" }
      );
    });

    it("constructs command without ACL and endpoint", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          ...defaultInputs,
          AWS_S3_ACL: "",
          AWS_S3_ENDPOINT: "",
        };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        'aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress',
        { stdio: "inherit" }
      );
    });

    it("constructs command with only ACL", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          ...defaultInputs,
          AWS_S3_ENDPOINT: "",
        };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        'aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --acl "public-read"',
        { stdio: "inherit" }
      );
    });

    it("constructs command with only endpoint", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          ...defaultInputs,
          AWS_S3_ACL: "",
        };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        'aws s3 sync "test-source-dir" "s3://test-bucket/test-prefix" --no-progress --endpoint-url "test-endpoint"',
        { stdio: "inherit" }
      );
    });

    it("constructs command with DELETE_REMOVED flag", async () => {
      getBooleanInputMock.mockImplementation((name: string) => {
        if (name === "DELETE_REMOVED") {
          return true;
        }
        return false;
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("--delete"),
        expect.anything()
      );
    });
  });

  describe("Environment variables", () => {
    it("sets all AWS environment variables correctly", async () => {
      await run();

      expect(process.env.AWS_ACCESS_KEY_ID).toBe("test-access-key");
      expect(process.env.AWS_SECRET_ACCESS_KEY).toBe("test-secret-key");
      expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
      expect(process.env.AWS_S3_ENDPOINT).toBe("test-endpoint");
    });

    it("does not set AWS_S3_ENDPOINT when empty", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
        return inputs[name] || "";
      });

      await run();

      expect(process.env.AWS_S3_ENDPOINT).toBeUndefined();
    });

    it("sets custom region correctly", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, AWS_REGION: "eu-west-1" };
        return inputs[name] || "";
      });

      await run();

      expect(process.env.AWS_DEFAULT_REGION).toBe("eu-west-1");
    });
  });

  describe("Edge cases", () => {
    it("handles special characters in bucket name and prefix", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          ...defaultInputs,
          AWS_S3_BUCKET: "my-bucket-123",
          AWS_S3_PREFIX: "path/to/files",
        };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("s3://my-bucket-123/path/to/files"),
        expect.anything()
      );
    });

    it("handles source directory with spaces", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { ...defaultInputs, SOURCE_DIR: "my source dir" };
        return inputs[name] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('aws s3 sync "my source dir" "s3://'),
        expect.anything()
      );
    });

    it("handles multiple execSync calls in correct order", async () => {
      const execSyncMock = jest.mocked(execSync);

      await run();

      expect(execSyncMock).toHaveBeenCalledTimes(2);
      expect(execSyncMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("aws s3 sync"),
        { stdio: "inherit" }
      );
      expect(execSyncMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("aws cloudfront create-invalidation"),
        { stdio: "pipe", encoding: "utf-8" }
      );
    });
  });
});
