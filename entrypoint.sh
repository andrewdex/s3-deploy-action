#!/bin/sh

set -e

# Function to check if required environment variables are set
check_env_variable() {
  if [ -z "$1" ]; then
    echo "$2 is not set. Quitting."
    exit 1
  fi
}

# Check required environment variables
check_env_variable "$AWS_S3_BUCKET" "AWS_S3_BUCKET"
check_env_variable "$AWS_ACCESS_KEY_ID" "AWS_ACCESS_KEY_ID"
check_env_variable "$AWS_SECRET_ACCESS_KEY" "AWS_SECRET_ACCESS_KEY"

# Set default AWS region if not set
AWS_REGION="${AWS_REGION:-us-east-1}"

# Set AWS S3 endpoint if provided
ENDPOINT_APPEND=""
if [ -n "$AWS_S3_ENDPOINT" ]; then
  ENDPOINT_APPEND="--endpoint-url $AWS_S3_ENDPOINT"
fi

# CHECK AWS CLI version
echo "Checking AWS CLI version..."
aws --version


# Configure AWS CLI with a dedicated profile
echo "Configuring AWS CLI profile for s3-deploy-action..."
aws configure --profile s3-deploy-action <<-EOF > /dev/null 2>&1
${AWS_ACCESS_KEY_ID}
${AWS_SECRET_ACCESS_KEY}
${AWS_REGION}
text
EOF

# Log syncing details
echo "Syncing files from ${SOURCE_DIR:-.} to s3://${AWS_S3_BUCKET}/${DEST_DIR}..."

# Sync files to S3 bucket using the dedicated profile
sh -c "aws s3 sync ${SOURCE_DIR:-.} s3://${AWS_S3_BUCKET}/${DEST_DIR} \
              --profile s3-deploy-action \
              --no-progress \
              ${ENDPOINT_APPEND} $*"

# Invalidate CloudFront cache if distribution ID is provided
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "Invalidating CloudFront cache for distribution ID $CLOUDFRONT_DISTRIBUTION_ID..."
  aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*" --profile s3-deploy-action
fi

# Clean up AWS CLI profile
echo "Cleaning up AWS CLI credentials..."
aws configure --profile s3-deploy-action <<-EOF > /dev/null 2>&1
null
null
null
text
EOF

echo "Deployment completed successfully."