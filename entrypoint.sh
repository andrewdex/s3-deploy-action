#!/bin/sh

set -e

# Check if required environment variables are set
check_env_variable() {
  if [ -z "$1" ]; then
    echo "$2 is not set. Quitting."
    exit 1
  fi
}

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

# Configure AWS CLI with a dedicated profile
aws configure --profile s3-deploy-action <<-EOF > /dev/null 2>&1
${AWS_ACCESS_KEY_ID}
${AWS_SECRET_ACCESS_KEY}
${AWS_REGION}
text
EOF

# Sync files to S3 bucket using the dedicated profile
sh -c "aws s3 sync ${SOURCE_DIR:-.} s3://${AWS_S3_BUCKET}/${DEST_DIR} \
              --profile s3-deploy-action \
              --no-progress \
              ${ENDPOINT_APPEND} $*"

# Clear out credentials after sync
aws configure --profile s3-deploy-action <<-EOF > /dev/null 2>&1
null
null
null
text
EOF