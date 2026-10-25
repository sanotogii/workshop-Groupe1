pipeline {
  agent any

  tools { nodejs 'node22' }

  triggers { githubPush() }

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
  }

  stages {
    stage('Install') {
      steps { sh 'npm ci' }
    }

    stage('SonarQube Analysis') {
      steps {
        script {
          def key = (env.GIT_BRANCH ==~ /(origin\/)?main/) ? 'learn-actions' : 'learn-actions-workshop-3'
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
  }

  post {
    success { echo 'pipeline OK' }
    failure { echo 'pipeline failed, check the stage logs' }
  }
}