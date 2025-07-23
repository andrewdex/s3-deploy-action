import * as core from "@actions/core";
import { execSync } from "child_process";
import { run } from "../src/index"; // Adjust path as needed

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

jest.mock("@actions/core");

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};

describe("S3 Deploy GitHub Action", () => {
  const setFailedMock = jest.spyOn(core, "setFailed");
  const getInputMock = jest.spyOn(core, "getInput");
  const errorMock = jest.spyOn(core, "error");

  const defaultInputs = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();

    // Reset environment variables
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_S3_ENDPOINT;

    getInputMock.mockImplementation((name: string) => {
      return defaultInputs[name as keyof typeof defaultInputs] || "";
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
      `aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --acl public-read --endpoint-url test-endpoint`,
      { stdio: "inherit" }
    );
  });

  it("syncs files to S3 bucket without prefix", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs = { ...defaultInputs, AWS_S3_PREFIX: "" };
      return inputs[name as keyof typeof inputs] || "";
    });

    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync test-source-dir s3://test-bucket --no-progress --acl public-read --endpoint-url test-endpoint`,
      { stdio: "inherit" }
    );
  });

  it("syncs files to S3 bucket without ACL when not provided", async () => {
    getInputMock.mockImplementation((name: string) => {
      const inputs = { ...defaultInputs, AWS_S3_ACL: "" };
      return inputs[name as keyof typeof inputs] || "";
    });

    await run();

    expect(execSync).toHaveBeenCalledWith(
      `aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --endpoint-url test-endpoint`,
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
      const inputs = { ...defaultInputs, CLOUDFRONT_DISTRIBUTION_ID: "" };
      return inputs[name as keyof typeof inputs] || "";
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
        const inputs = { ...defaultInputs, SOURCE_DIR: "" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("aws s3 sync . s3://"),
        expect.anything()
      );
    });

    it("uses default AWS_REGION when not provided", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, AWS_REGION: "" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(process.env.AWS_DEFAULT_REGION).toBe("us-east-1");
    });

    it("handles empty AWS_S3_ENDPOINT correctly", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        "aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --acl public-read",
        { stdio: "inherit" }
      );
      expect(process.env.AWS_S3_ENDPOINT).toBe("");
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
        getInputMock.mockImplementation((name: string) => {
          const inputs = { ...defaultInputs, AWS_S3_ACL: acl };
          return inputs[name as keyof typeof inputs] || "";
        });

        await run();

        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining(`--acl ${acl}`),
          expect.anything()
        );
      }
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
        return defaultInputs[name as keyof typeof defaultInputs] || "";
      });

      await run();

      expect(setFailedMock).toHaveBeenCalledWith(
        expect.stringContaining(
          "Input required and not supplied: AWS_ACCESS_KEY_ID"
        )
      );
    });
  });

  describe("Console output", () => {
    it("logs sync operation details", async () => {
      await run();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Syncing files from test-source-dir to S3 bucket: s3://test-bucket/test-prefix"
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Using endpoint: test-endpoint"
      );
    });

    it("logs CloudFront invalidation details", async () => {
      await run();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Invalidating CloudFront distribution: test-distribution-id"
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        "CloudFront cache invalidation completed."
      );
    });

    it("logs correct S3 destination without prefix", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, AWS_S3_PREFIX: "" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        "Syncing files from test-source-dir to S3 bucket: s3://test-bucket"
      );
    });
  });

  describe("Command construction", () => {
    it("constructs command with all optional parameters", async () => {
      await run();

      expect(execSync).toHaveBeenCalledWith(
        "aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --acl public-read --endpoint-url test-endpoint",
        { stdio: "inherit" }
      );
    });

    it("constructs command without ACL and endpoint", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = {
          ...defaultInputs,
          AWS_S3_ACL: "",
          AWS_S3_ENDPOINT: "",
        };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        "aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress",
        { stdio: "inherit" }
      );
    });

    it("constructs command with only ACL", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = {
          ...defaultInputs,
          AWS_S3_ENDPOINT: "",
        };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        "aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --acl public-read",
        { stdio: "inherit" }
      );
    });

    it("constructs command with only endpoint", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = {
          ...defaultInputs,
          AWS_S3_ACL: "",
        };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        "aws s3 sync test-source-dir s3://test-bucket/test-prefix --no-progress --endpoint-url test-endpoint",
        { stdio: "inherit" }
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

    it("handles undefined endpoint in environment variables", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, AWS_S3_ENDPOINT: "" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(process.env.AWS_S3_ENDPOINT).toBe("");
    });

    it("sets custom region correctly", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, AWS_REGION: "eu-west-1" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(process.env.AWS_DEFAULT_REGION).toBe("eu-west-1");
    });
  });

  describe("Edge cases", () => {
    it("handles special characters in bucket name and prefix", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = {
          ...defaultInputs,
          AWS_S3_BUCKET: "my-bucket-123",
          AWS_S3_PREFIX: "path/to/files",
        };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("s3://my-bucket-123/path/to/files"),
        expect.anything()
      );
    });

    it("handles source directory with spaces", async () => {
      getInputMock.mockImplementation((name: string) => {
        const inputs = { ...defaultInputs, SOURCE_DIR: "my source dir" };
        return inputs[name as keyof typeof inputs] || "";
      });

      await run();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining("aws s3 sync my source dir s3://"),
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
        expect.anything()
      );
      expect(execSyncMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("aws cloudfront create-invalidation"),
        expect.anything()
      );
    });
  });
});
