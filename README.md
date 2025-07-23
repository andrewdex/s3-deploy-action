# GitHub Action: S3 Deploy

[![CI](https://github.com/andrewdex/s3-deploy-action/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewdex/s3-deploy-action/actions/workflows/ci.yml)

This GitHub Action allows you to upload files to an S3 bucket.

## Usage

To use this action, you need to provide the following environment variables:

- `AWS_S3_BUCKET`: The name of the S3 bucket where you want to deploy the files.
- `AWS_ACCESS_KEY_ID`: The access key ID for your AWS account.
- `AWS_SECRET_ACCESS_KEY`: The secret access key for your AWS account.

Optionally, you can also set the following environment variables:

- `AWS_REGION`: The AWS region where your S3 bucket is located. If not set, it defaults to `us-east-1`.
- `AWS_S3_ENDPOINT`: The endpoint URL for your S3 bucket. This is useful if you are using a custom S3-compatible storage service.
- `AWS_S3_PREFIX`: An optional prefix for the S3 bucket. If set, files will be uploaded to the specified prefix within the bucket.
- `AWS_S3_ACL`: An optional ACL for uploaded files (e.g., `public-read`). Only use if ACLs are enabled on your S3 bucket. If not specified, no ACL will be set.

## Clearing CloudFront Cache

If you are using Amazon CloudFront to distribute your content, you may want to invalidate the cache after deploying new files to ensure that the latest version is served. This action can be configured to clear the CloudFront cache if a distribution ID is provided.

To clear the CloudFront cache, set the `CLOUDFRONT_DISTRIBUTION_ID` environment variable with your CloudFront distribution ID. The following script will invalidate the CloudFront cache:

```sh
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "Invalidating CloudFront cache..."
  aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*" --profile s3-deploy-action
fi
```

Make sure to provide the `CLOUDFRONT_DISTRIBUTION_ID` as a secret in your GitHub repository settings.

Make sure that your AWS credentials have the necessary permissions to create invalidations for the CloudFront distribution.

## Examples

### Basic Static Website Deployment

Deploy a static website to S3 with CloudFront cache invalidation:

```yaml
name: Deploy Website to S3
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Dependencies
        run: npm install
      - name: Build Website
        run: npm run build
      - name: Deploy to S3
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
          SOURCE_DIR: "dist"
          AWS_REGION: "us-east-1"
```

### Simple File Upload (No ACLs)

Upload files to S3 without setting ACLs (recommended for buckets with ACLs disabled):

```yaml
name: Upload Files to S3
on:
  push:
    branches:
      - main
jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Upload to S3
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: "public"
```

### Upload with Public Read ACL

For buckets that have ACLs enabled and you want files to be publicly readable:

```yaml
name: Deploy Public Website
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and Deploy
        run: |
          npm install
          npm run build
      - name: Deploy to S3 with Public ACL
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: "build"
          AWS_S3_ACL: "public-read"
```

### Deploy to Specific S3 Prefix

Upload files to a specific folder/prefix within your S3 bucket:

```yaml
name: Deploy to S3 Subfolder
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to S3 Prefix
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: "dist"
          AWS_S3_PREFIX: "v2/app"
          AWS_REGION: "us-west-2"
```

### Deploy to Custom S3-Compatible Storage

Use with MinIO, DigitalOcean Spaces, or other S3-compatible services:

```yaml
name: Deploy to DigitalOcean Spaces
on:
  push:
    branches:
      - main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Spaces
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.SPACES_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.SPACES_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SPACES_SECRET_KEY }}
          AWS_S3_ENDPOINT: "https://nyc3.digitaloceanspaces.com"
          AWS_REGION: "us-east-1"
          SOURCE_DIR: "build"
```

### Multi-Environment Deployment

Deploy different branches to different S3 prefixes:

```yaml
name: Multi-Environment Deploy
on:
  push:
    branches:
      - main
      - staging
      - develop
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install and Build
        run: |
          npm install
          npm run build
      - name: Deploy to Production
        if: github.ref == 'refs/heads/main'
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}
          SOURCE_DIR: "dist"
          AWS_S3_PREFIX: "production"
      - name: Deploy to Staging
        if: github.ref == 'refs/heads/staging'
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: "dist"
          AWS_S3_PREFIX: "staging"
      - name: Deploy to Development
        if: github.ref == 'refs/heads/develop'
        uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: "dist"
          AWS_S3_PREFIX: "dev"
```
