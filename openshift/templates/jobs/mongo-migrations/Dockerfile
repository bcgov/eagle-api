FROM alpine:latest
USER root

# install glibc for mongo/oc binaries
ENV LANG=C.UTF-8
RUN ALPINE_GLIBC_BASE_URL="https://github.com/sgerrand/alpine-pkg-glibc/releases/download" && \
    ALPINE_GLIBC_PACKAGE_VERSION="2.31-r0" && \
    ALPINE_GLIBC_BASE_PACKAGE_FILENAME="glibc-$ALPINE_GLIBC_PACKAGE_VERSION.apk" && \
    ALPINE_GLIBC_BIN_PACKAGE_FILENAME="glibc-bin-$ALPINE_GLIBC_PACKAGE_VERSION.apk" && \
    ALPINE_GLIBC_I18N_PACKAGE_FILENAME="glibc-i18n-$ALPINE_GLIBC_PACKAGE_VERSION.apk" && \
    apk add --no-cache --virtual=.build-dependencies wget ca-certificates && \
    echo \
        "-----BEGIN PUBLIC KEY-----\
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApZ2u1KJKUu/fW4A25y9m\
        y70AGEa/J3Wi5ibNVGNn1gT1r0VfgeWd0pUybS4UmcHdiNzxJPgoWQhV2SSW1JYu\
        tOqKZF5QSN6X937PTUpNBjUvLtTQ1ve1fp39uf/lEXPpFpOPL88LKnDBgbh7wkCp\
        m2KzLVGChf83MS0ShL6G9EQIAUxLm99VpgRjwqTQ/KfzGtpke1wqws4au0Ab4qPY\
        KXvMLSPLUp7cfulWvhmZSegr5AdhNw5KNizPqCJT8ZrGvgHypXyiFvvAH5YRtSsc\
        Zvo9GI2e2MaZyo9/lvb+LbLEJZKEQckqRj4P26gmASrZEPStwc+yqy1ShHLA0j6m\
        1QIDAQAB\
        -----END PUBLIC KEY-----" | sed 's/   */\n/g' > "/etc/apk/keys/sgerrand.rsa.pub" && \
    wget \
        "$ALPINE_GLIBC_BASE_URL/$ALPINE_GLIBC_PACKAGE_VERSION/$ALPINE_GLIBC_BASE_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_BASE_URL/$ALPINE_GLIBC_PACKAGE_VERSION/$ALPINE_GLIBC_BIN_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_BASE_URL/$ALPINE_GLIBC_PACKAGE_VERSION/$ALPINE_GLIBC_I18N_PACKAGE_FILENAME" && \
    apk add --no-cache \
        "$ALPINE_GLIBC_BASE_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_BIN_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_I18N_PACKAGE_FILENAME" && \
    \
    rm "/etc/apk/keys/sgerrand.rsa.pub" && \
    /usr/glibc-compat/bin/localedef --force --inputfile POSIX --charmap UTF-8 "$LANG" || true && \
    echo "export LANG=$LANG" > /etc/profile.d/locale.sh && \
    \
    apk del glibc-i18n && \
    \
    rm "/root/.wget-hsts" && \
    apk del .build-dependencies && \
    rm \
        "$ALPINE_GLIBC_BASE_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_BIN_PACKAGE_FILENAME" \
        "$ALPINE_GLIBC_I18N_PACKAGE_FILENAME"

# install curl
RUN apk update \
    && apk add --update curl rsync \
    && rm -rf /var/cache/apk/* \
    && apk upgrade

# install OC cli
ENV OPENSHIFT_VERSION v3.11.0
ENV OPENSHIFT_HASH 0cbc58b

RUN apk add --no-cache --virtual .build-deps curl tar \
    && curl --retry 7 -Lso /tmp/client-tools.tar.gz "https://github.com/openshift/origin/releases/download/${OPENSHIFT_VERSION}/openshift-origin-client-tools-${OPENSHIFT_VERSION}-${OPENSHIFT_HASH}-linux-64bit.tar.gz" \
    && tar zxf /tmp/client-tools.tar.gz --strip-components=1 -C /usr/local/bin \
    && rm /tmp/client-tools.tar.gz \
    && apk del .build-deps \
    && apk add --update ca-certificates

# install nodejs, npm
RUN apk add --update npm \
# install git
    && apk add --no-cache bash git openssh

# create a directory to shove the code into
RUN mkdir /eagle-api
# clone branch
RUN git clone -b develop https://github.com/bcgov/eagle-api.git /eagle-api

# start mongodb installs
RUN apk --update add curl libgcc libstdc++

# Install mongodb (alpine v3.8 will install mongo 3.6. For 4 use apline v3.9)
# grab repo list for mongo
# RUN echo 'http://dl-cdn.alpinelinux.org/alpine/v3.8/main' >> /etc/apk/repositories
# RUN echo 'http://dl-cdn.alpinelinux.org/alpine/v3.8/community' >> /etc/apk/repositories
# RUN apk add mongodb yaml-cpp=0.6.2-r2
# get mongo up and running
# RUN apk --update add mongodb mongodb-tools
ENV MONGODB_VERSION 3.6.0
RUN apk --update add curl libgcc libstdc++ \
    && cd /tmp \
    && curl -SLo- https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-${MONGODB_VERSION}.tgz | tar xz \
    && mv mongodb-linux-x86_64-${MONGODB_VERSION}/bin/* /usr/bin/ \
    && apk del curl \
    && rm -rf /tmp/* /var/cache/apk/* 

# make a data directory (I don't think we need to persist because this pod will be tossed?)
RUN mkdir -p /data/db
# make a location for the dump file
RUN mkdir -p /data/dump

# expose the port (probably not needed, mongo will only be used internally)
# EXPOSE 27017
# run mongod
CMD ["mongod"]

# call the entrypoint script
# The bash script will handle running the migrations and clean up
# COPY ./entrypoint.sh /
# ENTRYPOINT ["/entrypoint.sh"]

# change from root (no way to go back from here!)
# USER 1001
# for debugging only, remove this when done!
# this command will let the image run, even when the script it finished
# so you can log into it, check logs, etc. We don't want this behaviour
# outside of local testing (assuming you dont run CMD mongod)
# CMD tail -f /dev/null