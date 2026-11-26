{{- define "gato.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gato.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "gato.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "gato.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "gato.selectorLabels" -}}
app.kubernetes.io/name: {{ include "gato.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "gato.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{- define "gato.uploadsClaimName" -}}
{{- printf "%s-uploads" (include "gato.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "gato.secretName" -}}
{{- required "set existingSecret: a Secret with DATABASE_URL, BETTER_AUTH_SECRET and the mail and storage secrets" .Values.existingSecret -}}
{{- end -}}

{{- define "gato.localStorage" -}}
{{- $provider := .Values.storage.provider -}}
{{- if not (has $provider (list "local" "s3")) -}}
{{- fail (printf "storage.provider must be local or s3, got %q" (toString $provider)) -}}
{{- end -}}
{{- if eq $provider "local" -}}
{{- if gt (int .Values.replicaCount) 1 -}}
{{- fail "storage.provider=local supports one replica; use storage.provider=s3 for more" -}}
{{- end -}}
true
{{- end -}}
{{- end -}}

{{- define "gato.uploadsPath" -}}
/app/volumes/uploads
{{- end -}}
