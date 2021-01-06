#!/usr/bin/env bash

echo -e "-------- GETTING ACCESS TOKEN --------\n"
export TOKEN=$(curl -X POST "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
-H "Content-Type: application/x-www-form-urlencoded" \
-d "grant_type=client_credentials" \
-d "client_id=${KEYCLOAK_CLIENT_ID}" \
-d "client_secret=${KEYCLOAK_CLIENT_SECRET}" | jq -r '.access_token')


