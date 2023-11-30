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
      - uses: andrewdex/s3-deploy-action@main
        with:
          args: --acl public-read --follow-symlinks --delete --exclude '.git*/*'
        env:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: "us-east-2" # defaults to us-east-1
          SOURCE_DIR: "dist/website/browser" # defaults to entire repository otherwise
```
