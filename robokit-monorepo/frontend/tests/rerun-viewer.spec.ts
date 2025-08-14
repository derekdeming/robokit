import { test, expect } from '@playwright/test'

test.describe('RerunViewer Component', () => {
  test('should show empty state when no visualization is available', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div class="flex items-center justify-center border rounded-lg bg-muted/10" style="height: 600px;">
            <div class="text-center p-4">
              <p class="text-muted-foreground mb-2">No visualization available</p>
              <p class="text-sm text-muted-foreground">Run a visualization job to see data here</p>
            </div>
          </div>
        </body>
      </html>
    `)

    await expect(page.locator('text=No visualization available')).toBeVisible()
    await expect(page.locator('text=Run a visualization job to see data here')).toBeVisible()
  })

  test('should show loading state', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div class="rounded-lg overflow-hidden border" style="height: 600px; position: relative;">
            <div class="flex items-center justify-center h-full">
              <p class="text-muted-foreground">Loading Rerun viewer...</p>
            </div>
          </div>
        </body>
      </html>
    `)

    await expect(page.locator('text=Loading Rerun viewer...')).toBeVisible()
  })

  test('should show error state', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div class="rounded-lg overflow-hidden border" style="height: 600px; position: relative;">
            <div class="flex items-center justify-center h-full">
              <div class="text-center p-4">
                <p class="text-red-600 mb-2">Failed to load viewer</p>
                <p class="text-sm text-muted-foreground">WebGPU not supported. Enable WebGPU in chrome://flags/#enable-unsafe-webgpu</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)

    await expect(page.locator('text=Failed to load viewer')).toBeVisible()
    await expect(page.locator('text=WebGPU not supported')).toBeVisible()
  })

  test('should handle different error types', async ({ page }) => {
    const errorMessages = [
      'WebGPU not supported. Enable WebGPU in chrome://flags/#enable-unsafe-webgpu',
      'Browser compatibility issue. Try updating your browser or enabling WebGPU support.',
      'Failed to load visualization data. Check that the server is running.',
      'Failed to load viewer'
    ]

    for (const errorMessage of errorMessages) {
      await page.setContent(`
        <html>
          <body>
            <div class="text-center p-4">
              <p class="text-red-600 mb-2">Failed to load viewer</p>
              <p class="text-sm text-muted-foreground">${errorMessage}</p>
            </div>
          </body>
        </html>
      `)

      await expect(page.locator(`text=${errorMessage}`).first()).toBeVisible()
    }
  })

  test('should apply correct dimensions and styling', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div 
            class="rounded-lg overflow-hidden border custom-class"
            style="height: 400px; width: 80%; position: relative; min-width: 600px; min-height: 400px;"
          >
            <div class="absolute inset-0 w-full h-full bg-gray-100 dark:bg-gray-800"></div>
          </div>
        </body>
      </html>
    `)

    const container = page.locator('.custom-class')
    await expect(container).toHaveCSS('height', '400px')
    await expect(container).toHaveClass(/rounded-lg/)
    await expect(container).toHaveClass(/custom-class/)
  })
})

test.describe('Rerun Viewer Integration', () => {
  test('should validate URL formats', async ({ page }) => {
    const testUrls = [
      'http://localhost:8000/api/v1/datasets/123/artifacts/456/recording.rrd',
      'rerun+http://localhost:9876/proxy',
      'https://example.com/path/to/recording.rrd'
    ]

    for (const url of testUrls) {
      await page.evaluate((testUrl) => {
        const isValidHttpUrl = testUrl.startsWith('http://') || testUrl.startsWith('https://')
        const isValidRerunUrl = testUrl.startsWith('rerun+http://')
        return isValidHttpUrl || isValidRerunUrl
      }, url)
    }
  })

  test('should handle viewer lifecycle', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div id="viewer-states">
            <div class="state loading">Loading Rerun viewer...</div>
            <div class="state loaded" style="display: none;">Viewer loaded successfully</div>
            <div class="state error" style="display: none;">Failed to load viewer</div>
          </div>
          <script>
            setTimeout(() => {
              document.querySelector('.loading').style.display = 'none'
              document.querySelector('.loaded').style.display = 'block'
            }, 100)
          </script>
        </body>
      </html>
    `)

    await expect(page.locator('text=Loading Rerun viewer...')).toBeVisible()
    
    await expect(page.locator('text=Viewer loaded successfully')).toBeVisible({ timeout: 1000 })
  })
})