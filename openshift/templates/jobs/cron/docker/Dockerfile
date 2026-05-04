FROM alpine:3.21

# Install curl and jq (only runtime deps needed for the cron scripts)
RUN apk add --no-cache curl jq && \
    mkdir -p /opt/cron/jobs && \
    chgrp -R 0 /opt/cron && \
    chmod -R g=u /opt/cron

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /opt/cron

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
