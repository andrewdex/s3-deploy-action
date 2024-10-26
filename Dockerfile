FROM python:3.9-alpine

LABEL "com.github.actions.name"="S3 Deploy"
LABEL "com.github.actions.description"="Deploy static websites to an S3 bucket"
LABEL "com.github.actions.icon"="upload-cloud"
LABEL "com.github.actions.color"="blue"

LABEL version="1.0.0"
LABEL repository="https://github.com/andrewdex/s3-deploy-action"
LABEL homepage="https://dilushagonagala.com/"
LABEL maintainer="Dilusha Gonagala <hello@dilushagonagala.com>"
LABEL "com.github.actions.license"="MIT"

ENV AWSCLI_VERSION='2.18.15'

RUN apk add --no-cache curl \
    && pip install --quiet --no-cache-dir awscli==${AWSCLI_VERSION} \
    && apk del curl

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
