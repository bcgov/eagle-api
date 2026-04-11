{{/*
Expand the chart name.
*/}}
{{- define "typesense.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Full release name.
*/}}
{{- define "typesense.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Chart label.
*/}}
{{- define "typesense.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "typesense.labels" -}}
helm.sh/chart: {{ include "typesense.chart" . }}
{{ include "typesense.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app: eagle-epic
{{- end }}

{{/*
Selector labels for the Typesense server pod.
*/}}
{{- define "typesense.selectorLabels" -}}
app.kubernetes.io/name: {{ include "typesense.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Selector labels for the sync service pod.
*/}}
{{- define "typesense.sync.selectorLabels" -}}
app.kubernetes.io/name: {{ include "typesense.name" . }}-sync
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
