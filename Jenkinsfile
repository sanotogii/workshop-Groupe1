pipeline {
  agent any

  tools { nodejs 'node22' }

  triggers { githubPush() }

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  parameters {
    string(name: 'TARGET_URL', defaultValue: 'https://notes.khalidlab.tech', description: 'App to scan with the ZAP baseline (passive) scan')
    booleanParam(name: 'ACTIVE_SCAN', defaultValue: false, description: 'Run the ZAP active scan against a throwaway OWASP Juice Shop container (never against your real app)')
  }

  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }

    stage('SonarQube Analysis') {
      steps {
        script {
          // main -> learn-actions ; autre branche -> learn-actions-<branche> (ex. learn-actions-workshop-4)
          def branch = (env.GIT_BRANCH ?: 'main').replaceFirst(/^origin\//, '')
          def key = (branch == 'main') ? 'learn-actions' : "learn-actions-${branch}"
          withSonarQubeEnv('sonarqube') {
            sh "${tool 'sonar-scanner'}/bin/sonar-scanner -Dsonar.projectKey=${key} -Dsonar.projectName=${key}"
          }
        }
      }
    }

    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Semgrep') {
      steps {
        sh '''
          python3 -m venv .semgrep-venv
          .semgrep-venv/bin/pip install --quiet semgrep
          .semgrep-venv/bin/semgrep scan \
            --config p/default --config p/nextjs \
            --metrics=off --error \
            --exclude node_modules --exclude .next \
            --exclude .open-next --exclude .semgrep-venv \
            --exclude .github .
        '''
      }
    }

    stage('OWASP Dependency-Check') {
      steps {
        dependencyCheck odcInstallation: 'dependency-check', nvdCredentialsId: 'nvd-api-key', additionalArguments: '--scan package-lock.json --format HTML --format XML --failOnCVSS 7'
      }
      post {
        always {
          dependencyCheckPublisher pattern: '**/dependency-check-report.xml'
          archiveArtifacts artifacts: 'dependency-check-report.*', allowEmptyArchive: true
        }
      }
    }

    stage('Deploy') {
      when { expression { env.GIT_BRANCH ==~ /(origin\/)?main/ } }
      steps {
        withCredentials([
          string(credentialsId: 'cloudflare-api-token', variable: 'CLOUDFLARE_API_TOKEN'),
          string(credentialsId: 'cloudflare-account-id', variable: 'CLOUDFLARE_ACCOUNT_ID'),
          string(credentialsId: 'n8n-webhook-url', variable: 'N8N_WEBHOOK_URL')
        ]) {
          sh '''
            if [ -z "$N8N_WEBHOOK_URL" ]; then
              echo "N8N_WEBHOOK_URL credential is not configured"
              exit 1
            fi
            printf '%s' "$N8N_WEBHOOK_URL" | npx wrangler secret put N8N_WEBHOOK_URL
            npm run deploy
          '''
        }
      }
    }
    stage('OWASP ZAP Baseline') {
      environment { TARGET_URL = "${params.TARGET_URL}" }
      steps {
        sh '''
          mkdir -p zap-reports
          docker rm -f zap-baseline 2>/dev/null || true

          set +e
          docker run --name zap-baseline -u root -t ghcr.io/zaproxy/zaproxy:stable \
            bash -c "mkdir -p /zap/wrk && zap-baseline.py -t $TARGET_URL -r zap-baseline.html -J zap-baseline.json -I"
          rc=$?
          set -e

          docker cp zap-baseline:/zap/wrk/. zap-reports/ || true
          docker rm -f zap-baseline || true

          echo "ZAP baseline exit code: $rc"
          if [ "$rc" -ge 3 ]; then echo "ZAP baseline failed (exit $rc)"; exit 1; fi
          if [ "$rc" -eq 1 ]; then echo "ZAP: alertes FAIL detectees"; exit 1; fi
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'zap-reports/zap-baseline.*', allowEmptyArchive: true
          publishHTML(target: [
            reportDir: 'zap-reports',
            reportFiles: 'zap-baseline.html',
            reportName: 'ZAP Baseline Report',
            keepAll: true,
            allowMissing: true
          ])
        }
      }
    }

    stage('OWASP ZAP Active Scan') {
      when { expression { params.ACTIVE_SCAN } }
      options { timeout(time: 40, unit: 'MINUTES') }
      steps {
        script {
          def rc = sh(returnStatus: true, script: '''
            mkdir -p zap-reports
            docker rm -f zap-full juice-shop 2>/dev/null || true
            docker network create zap-net 2>/dev/null || true

            # Start a throwaway vulnerable target on a private network
            docker run -d --name juice-shop --network zap-net bkimminich/juice-shop

            # Wait up to ~2 minutes for it to answer
            ready=0
            for i in $(seq 1 40); do
              if docker run --rm --network zap-net curlimages/curl -sf http://juice-shop:3000 >/dev/null; then
                ready=1; break
              fi
              sleep 3
            done
            if [ "$ready" -ne 1 ]; then
              echo "Juice Shop did not start"
              exit 3
            fi

            docker run --name zap-full --network zap-net \
              ghcr.io/zaproxy/zaproxy:stable \
              sh -c 'mkdir -p /zap/wrk && zap-full-scan.py -t http://juice-shop:3000 -m 3 -r zap-full.html -J zap-full.json'
            rc=$?
            docker cp zap-full:/zap/wrk/. zap-reports/ || true
            exit $rc
          ''')
          echo "ZAP active scan exit code: ${rc}"
          // Juice Shop is deliberately vulnerable, so FAIL (1) and WARN (2) both mark the build unstable
          if (rc == 1 || rc == 2) {
            unstable('ZAP active scan found issues')
          } else if (rc != 0) {
            error("ZAP active scan failed (exit ${rc})")
          }
        }
      }
      post {
        always {
          sh '''
            docker rm -f zap-full juice-shop 2>/dev/null || true
            docker network rm zap-net 2>/dev/null || true
          '''
          archiveArtifacts artifacts: 'zap-reports/*', allowEmptyArchive: true
          publishHTML(target: [
            reportDir: 'zap-reports',
            reportFiles: 'zap-full.html',
            reportName: 'ZAP Active Scan Report',
            keepAll: true,
            allowMissing: true
          ])
        }
      }
    }
  }

  post {
    success { echo 'pipeline OK' }
    unstable { echo 'pipeline finished with warnings (check the ZAP reports)' }
    failure { echo 'pipeline failed, check the stage logs' }
  }
}