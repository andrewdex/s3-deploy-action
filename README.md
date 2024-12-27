# GitHub Action: S3 Deploy

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

## Example

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
      - uses: actions/checkout@master
      - name: Install Dependencies 🔰
        run: npm i
      - name: Run Build 🛠
        run: npm run build
        env:
          CI: false
      - uses: andrewdex/s3-deploy-action@v1
        with:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} // Optional
          AWS_REGION: "us-east-2" # defaults to us-east-1
          SOURCE_DIR: "dist/website/browser" # defaults to entire repository otherwise
          AWS_S3_PREFIX: "your-prefix" # Optional
```
