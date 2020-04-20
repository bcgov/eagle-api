#!/bin/sh
#################################################
# 
# This script calls a data generation
# utility built using the jest test suite.
# It uses factories so that data generation
# stays up to date with the models and happens
# as code.
# 
#################################################

PROJECTS=10;
default_deterministic_seed_mode="Static";
random_seed_mode="Random";
SEED_MODE="${default_deterministic_seed_mode}";
default_transient_data_mode="Unsaved";
persistent_data_mode="Saved";
DATA_MODE="${default_transient_data_mode}";
default_db_passes="Single";
multiple_db_passes="Multiple";
DB_PASSES="${default_db_passes}";
usage="\n./generate.sh [the number of projects to generate] [$default_deterministic_seed_mode (default) / $random_seed_mode] [$default_transient_data_mode (default) / $persistent_data_mode] [$default_db_passes (default) / $multiple_db_passes]\n\nExamples:\n./generate.sh 10 $default_deterministic_seed_mode $default_transient_data_mode $default_db_passes\n./generate.sh 3 $random_seed_mode $persistent_data_mode $multiple_db_passes\n\n";
valid_numeric_pattern='^[0-9]+$';
valid_data_mode_pattern="^($default_transient_data_mode|$persistent_data_mode)+$";
valid_seed_mode_pattern="^($default_deterministic_seed_mode|$random_seed_mode)+$";
valid_db_passes_pattern="^($default_db_passes|$multiple_db_passes)+$";
if [ ! -z "${4}" ]; then DB_PASSES=$4; fi
if [ ! -z "${3}" ]; then DATA_MODE=$3; fi
if [ ! -z "${2}" ]; then SEED_MODE=$2; fi
if [ ! -z "${1}" ]; then PROJECTS=$1; fi
# printf "PROJECTS: $PROJECTS\nDATA_MODE: $DATA_MODE\nSEED_MODE: $SEED_MODE\n"; 
if ! [[ "${PROJECTS}" =~ $valid_numeric_pattern ]]; then printf "$usage"; exit 1; fi
if ! [[ "${SEED_MODE}" =~ $valid_seed_mode_pattern ]]; then printf "$usage"; exit 1; fi
if ! [[ "${DATA_MODE}" =~ $valid_data_mode_pattern ]]; then printf "$usage"; exit 1; fi
if ! [[ "${DB_PASSES}" =~ $valid_db_passes_pattern ]]; then printf "$usage"; exit 1; fi
JSON="{\"generate\":\"true\",\"projects\":\"$PROJECTS\",\"seed_mode\":\"$SEED_MODE\",\"data_mode\":\"$DATA_MODE\",\"db_passes\":\"$DB_PASSES\"}\n";
#printf "$JSON\n";
rm -f /tmp/generate.config;
printf "$JSON" > /tmp/generate.config;
node_modules/.bin/jest ./api/test/data_generators/generate.test.js;
rm -f /tmp/generate.config;
