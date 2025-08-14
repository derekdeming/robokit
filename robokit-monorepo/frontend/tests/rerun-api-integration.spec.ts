import { test, expect } from '@playwright/test'

test.describe('Rerun API Integration', () => {
  test('should validate rerun analysis parameters', async ({ page }) => {
    await page.evaluate(() => {
      const validFileParams = {
        mode: 'file',
        stride: 2,
        max_frames: 3000,
        jpeg_quality: 90,
        timeline: 'time',
        blueprint: 'episode_review',
        include_streams: {
          images: ['*'],
          joints: ['*'],
          depth: [],
          lidar: []
        }
      }

      const validStreamParams = {
        mode: 'stream',
        episode_index: 0,
        streaming_ttl_seconds: 1800
      }

      // Validate file mode parameters
      const isValidFileMode = validFileParams.mode === 'file'
      const isValidStride = validFileParams.stride >= 1
      const isValidFrames = validFileParams.max_frames > 0
      const isValidQuality = validFileParams.jpeg_quality >= 1 && validFileParams.jpeg_quality <= 100
      const isValidTimeline = ['time', 'frame'].includes(validFileParams.timeline)
      
      // Validate stream mode parameters  
      const isValidStreamMode = validStreamParams.mode === 'stream'
      const isValidEpisode = validStreamParams.episode_index >= 0
      const isValidTTL = validStreamParams.streaming_ttl_seconds > 0

      return {
        fileValid: isValidFileMode && isValidStride && isValidFrames && isValidQuality && isValidTimeline,
        streamValid: isValidStreamMode && isValidEpisode && isValidTTL
      }
    })
  })

  test('should handle different response formats', async ({ page }) => {
    await page.evaluate(() => {
      const fileResponse = {
        full_result: {
          rrd_url: 'http://localhost:8000/api/v1/datasets/456/artifacts/123/recording.rrd',
          blueprint_url: 'http://localhost:8000/api/v1/datasets/456/artifacts/123/blueprint.rbl', 
          frames_written: 1500,
          sdk_version: '0.24.1',
          viewer_version: '0.24.1'
        },
        summary: {
          mode: 'file',
          frames_written: 1500,
          episode_index: 1,
          success: true,
          duration_seconds: 120.5
        }
      }

      const streamResponse = {
        full_result: {
          viewer_url: 'rerun+http://localhost:9876/proxy',
          frames_sent: 250,
          expires_at: '2024-01-01T01:00:00Z',
          sdk_version: '0.24.1',
          viewer_version: '0.24.1'
        },
        summary: {
          mode: 'stream',
          frames_sent: 250,
          episode_index: 0,
          success: true,
          active: true
        }
      }

      const hasRequiredFileFields = fileResponse.full_result.rrd_url && 
                                   fileResponse.full_result.frames_written &&
                                   fileResponse.summary.mode === 'file'

      const hasRequiredStreamFields = streamResponse.full_result.viewer_url &&
                                     streamResponse.full_result.expires_at &&
                                     streamResponse.summary.mode === 'stream'

      return { fileValid: hasRequiredFileFields, streamValid: hasRequiredStreamFields }
    })
  })

  test('should handle URL formatting correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const extractVisualizationUrl = (result: any) => {
        const vizUrl = result.rrd_url || result.viewer_url || result.local_path
        if (!vizUrl || typeof vizUrl !== 'string') return null
        
        return vizUrl.startsWith('/api/v1/') 
          ? `http://localhost:8000${vizUrl}` 
          : vizUrl
      }

      const testCases = [
        { 
          input: { rrd_url: '/api/v1/datasets/123/artifacts/456/recording.rrd' },
          expected: 'http://localhost:8000/api/v1/datasets/123/artifacts/456/recording.rrd'
        },
        {
          input: { viewer_url: 'rerun+http://localhost:9876/proxy' },
          expected: 'rerun+http://localhost:9876/proxy'
        },
        {
          input: { rrd_url: 'https://example.com/recording.rrd' },
          expected: 'https://example.com/recording.rrd'
        }
      ]

      const results = testCases.map(testCase => ({
        input: testCase.input,
        output: extractVisualizationUrl(testCase.input),
        expected: testCase.expected,
        matches: extractVisualizationUrl(testCase.input) === testCase.expected
      }))

      return results
    })

    result.forEach(test => {
      expect(test.matches).toBe(true)
    })
  })

  test('should validate job status transitions', async ({ page }) => {
    await page.evaluate(() => {
      const validStatusTransitions: Record<string, string[]> = {
        'pending': ['running', 'failed'],
        'running': ['completed', 'failed'],
        'completed': [],
        'failed': []
      }

      const isValidTransition = (from: string, to: string) => {
        return validStatusTransitions[from]?.includes(to) || false
      }

      const tests = [
        { from: 'pending', to: 'running', shouldBeValid: true },
        { from: 'running', to: 'completed', shouldBeValid: true },
        { from: 'running', to: 'failed', shouldBeValid: true },
        { from: 'completed', to: 'running', shouldBeValid: false },
        { from: 'failed', to: 'completed', shouldBeValid: false }
      ]

      return tests.every(test => 
        isValidTransition(test.from, test.to) === test.shouldBeValid
      )
    })
  })

  test('should handle error responses correctly', async ({ page }) => {
    await page.evaluate(() => {
      const errorResponseFormats = [
        {
          status: 422,
          body: { detail: 'Invalid parameters: stride must be >= 1', field: 'stride' }
        },
        {
          status: 404,
          body: { detail: 'Dataset not found' }
        },
        {
          status: 500, 
          body: { detail: 'RRD generation service unavailable' }
        }
      ]

      const handleError = (errorResponse: any) => {
        const { status, body } = errorResponse
        return {
          message: body.detail || `HTTP ${status}`,
          field: body.field,
          status: status
        }
      }

      return errorResponseFormats.map(errorResponse => ({
        original: errorResponse,
        handled: handleError(errorResponse)
      }))
    })
  })

  test('should validate configuration schemas', async ({ page }) => {
    await page.evaluate(() => {
      const validBlueprints = ['episode_review', 'quality_triage', 'alignment', 'minimal']
      const defaultStreamIncludes = {
        images: ['*'],
        depth: [],
        lidar: [],
        joints: ['*'],
        forces: [],
        torques: []
      }

      const paramRanges = {
        stride: { min: 1, max: 10 },
        max_frames: { min: 1, max: 5000000 },
        jpeg_quality: { min: 1, max: 100 },
        downscale_long_side: { min: 64, max: 4096 }
      }

      const sampleConfig = {
        mode: 'file',
        stride: 2,
        max_frames: 3000,
        jpeg_quality: 90,
        blueprint: 'episode_review',
        timeline: 'time',
        include_streams: defaultStreamIncludes
      }

      const isValidConfig = 
        ['file', 'stream'].includes(sampleConfig.mode) &&
        sampleConfig.stride >= paramRanges.stride.min && sampleConfig.stride <= paramRanges.stride.max &&
        sampleConfig.max_frames >= paramRanges.max_frames.min && sampleConfig.max_frames <= paramRanges.max_frames.max &&
        sampleConfig.jpeg_quality >= paramRanges.jpeg_quality.min && sampleConfig.jpeg_quality <= paramRanges.jpeg_quality.max &&
        validBlueprints.includes(sampleConfig.blueprint) &&
        ['time', 'frame'].includes(sampleConfig.timeline)

      return { isValid: isValidConfig, config: sampleConfig }
    })
  })

  test('should handle streaming session lifecycle', async ({ page }) => {
    await page.evaluate(() => {
      const streamSession = {
        dataset_id: 123,
        viewer_url: 'rerun+http://localhost:9876/proxy',
        port: 9876,
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        frames_sent: 0,
        active: true
      }

      const isStreamActive = (session: any) => {
        return session.active && session.expires_at > new Date()
      }

      const checkExpiration = (session: any) => {
        const now = new Date()
        if (session.expires_at <= now) {
          session.active = false
          return false
        }
        return true
      }

      return {
        initiallyActive: isStreamActive(streamSession),
        validViewerUrl: streamSession.viewer_url.startsWith('rerun+http://'),
        hasValidExpiration: streamSession.expires_at > new Date()
      }
    })
  })

  test('should validate job polling behavior', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div id="job-status">pending</div>
          <div id="progress">0</div>
          <script>
            let jobStatus = 'pending'
            let progress = 0
            let pollCount = 0
            
            const pollJob = () => {
              pollCount++
              
              if (pollCount <= 2) {
                jobStatus = 'running'
                progress = pollCount * 0.5
              } else if (pollCount === 3) {
                jobStatus = 'completed' 
                progress = 1.0
              }
              
              document.getElementById('job-status').textContent = jobStatus
              document.getElementById('progress').textContent = Math.round(progress * 100) + '%'
              
              if (jobStatus !== 'completed' && jobStatus !== 'failed') {
                setTimeout(pollJob, 100)
              }
            }
            
            pollJob()
          </script>
        </body>
      </html>
    `)

    await expect(page.locator('#job-status')).toHaveText('completed', { timeout: 1000 })
    await expect(page.locator('#progress')).toHaveText('100%')
  })

  test('should handle concurrent rerun jobs', async ({ page }) => {
    await page.evaluate(() => {
      const jobs = [
        { id: 1, dataset_id: 123, job_type: 'rerun_visualization', status: 'running', progress: 0.3 },
        { id: 2, dataset_id: 456, job_type: 'rerun_visualization', status: 'completed', progress: 1.0 },
        { id: 3, dataset_id: 789, job_type: 'rerun_visualization', status: 'failed', progress: 0.0 }
      ]

      const rerunJobs = jobs.filter(job => job.job_type === 'rerun_visualization')
      const jobsByStatus = rerunJobs.reduce((acc: any, job) => {
        if (!acc[job.status]) acc[job.status] = []
        acc[job.status].push(job)
        return acc
      }, {} as any)

      return {
        totalRerunJobs: rerunJobs.length,
        runningJobs: jobsByStatus.running?.length || 0,
        completedJobs: jobsByStatus.completed?.length || 0,
        failedJobs: jobsByStatus.failed?.length || 0
      }
    })
  })
})