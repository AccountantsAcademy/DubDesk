import { useProjectStore } from '@renderer/stores/project.store'
import { useUIStore } from '@renderer/stores/ui.store'
import { SUPPORTED_LANGUAGES } from '@shared/constants/defaults'
import type React from 'react'
import { useCallback, useState } from 'react'

export function NewProjectModal(): React.JSX.Element | null {
  const isOpen = useUIStore((state) => state.modals.newProject.isOpen)
  const closeModal = useUIStore((state) => state.closeModal)
  const addToast = useUIStore((state) => state.addToast)
  const createProject = useProjectStore((state) => state.createProject)

  const [step, setStep] = useState<'video' | 'language' | 'import'>('video')
  const [videoPath, setVideoPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('es')
  const [sourceLanguage, setSourceLanguage] = useState('en')
  const [importMode, setImportMode] = useState<'automatic' | 'csv'>('automatic')
  const [csvPath, setCsvPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSelectVideo = useCallback(async () => {
    try {
      const result = await window.dubdesk.fs.openVideoDialog()
      if (result.success && !result.canceled && result.filePath) {
        setVideoPath(result.filePath)
        // Set project name from filename
        const filename =
          result.filePath
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') || 'New Project'
        setProjectName(filename)
        setStep('language')
      }
    } catch (error) {
      console.error('Failed to select video:', error)
      addToast('error', 'Failed to select video file')
    }
  }, [addToast])

  const handleSelectCsv = useCallback(async () => {
    try {
      const result = await window.dubdesk.fs.openCsvDialog()
      if (result.success && !result.canceled && result.filePath) {
        setCsvPath(result.filePath)
      }
    } catch (error) {
      console.error('Failed to select CSV:', error)
      addToast('error', 'Failed to select CSV file')
    }
  }, [addToast])

  const handleClose = useCallback(() => {
    closeModal('newProject')
    // Reset state
    setStep('video')
    setVideoPath('')
    setProjectName('')
    setTargetLanguage('es')
    setSourceLanguage('en')
    setImportMode('automatic')
    setCsvPath('')
  }, [closeModal])

  const handleCreate = useCallback(async () => {
    if (!videoPath || !projectName || !targetLanguage) {
      addToast('error', 'Please fill in all required fields')
      return
    }

    if (importMode === 'csv' && !csvPath) {
      addToast('error', 'Please select a CSV file')
      return
    }

    setIsLoading(true)
    try {
      await createProject({
        name: projectName,
        videoPath,
        targetLanguage,
        sourceLanguage,
        importMode,
        csvPath: importMode === 'csv' ? csvPath : undefined
      })
      addToast('success', 'Project created successfully')
      handleClose()
    } catch (error) {
      console.error('Failed to create project:', error)
      addToast('error', 'Failed to create project')
    } finally {
      setIsLoading(false)
    }
  }, [
    videoPath,
    projectName,
    targetLanguage,
    sourceLanguage,
    importMode,
    csvPath,
    createProject,
    addToast,
    handleClose
  ])

  const handleBack = useCallback(() => {
    if (step === 'language') setStep('video')
    else if (step === 'import') setStep('language')
  }, [step])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70">
      <div className="bg-chrome-surface border border-chrome-border rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-chrome-border">
          <h2 className="text-lg font-medium">New Project</h2>
          <button onClick={handleClose} className="text-chrome-muted hover:text-chrome-text">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-center gap-2">
            {[
              { id: 'video', label: 'Video' },
              { id: 'language', label: 'Language' },
              { id: 'import', label: 'Import' }
            ].map((s, index) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                    step === s.id
                      ? 'bg-accent-primary text-white'
                      : index < ['video', 'language', 'import'].indexOf(step)
                        ? 'bg-accent-primary/20 text-accent-primary'
                        : 'bg-chrome-hover text-chrome-muted'
                  }`}
                >
                  {index + 1}
                </div>
                <span
                  className={`ml-2 text-sm ${
                    step === s.id ? 'text-chrome-text font-medium' : 'text-chrome-muted'
                  }`}
                >
                  {s.label}
                </span>
                {index < 2 && (
                  <div
                    className={`w-8 h-0.5 mx-3 ${
                      index < ['video', 'language', 'import'].indexOf(step)
                        ? 'bg-accent-primary'
                        : 'bg-chrome-border'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'video' && (
            <div className="space-y-4">
              <p className="text-chrome-muted">Select a video file to dub</p>
              <button
                onClick={handleSelectVideo}
                className="w-full h-32 border-2 border-dashed border-chrome-border rounded-lg flex flex-col items-center justify-center hover:border-accent-primary hover:bg-chrome-hover transition-colors"
              >
                <svg
                  className="w-12 h-12 text-chrome-muted mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm text-chrome-muted">Click to select video</span>
                <span className="text-xs text-chrome-muted/60 mt-1">
                  MP4, MOV, AVI, MKV supported
                </span>
              </button>
            </div>
          )}

          {step === 'language' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-chrome-muted mb-1">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 bg-chrome-bg border border-chrome-border rounded focus:outline-none focus:border-accent-primary"
                  placeholder="My Project"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-chrome-muted mb-1">Source Language</label>
                  <select
                    value={sourceLanguage}
                    onChange={(e) => setSourceLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-chrome-bg border border-chrome-border rounded focus:outline-none focus:border-accent-primary"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-chrome-muted mb-1">Target Language</label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-chrome-bg border border-chrome-border rounded focus:outline-none focus:border-accent-primary"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 bg-chrome-bg rounded border border-chrome-border">
                <div className="text-sm text-chrome-muted truncate">
                  <span className="font-medium">Video:</span> {videoPath}
                </div>
              </div>
            </div>
          )}

          {step === 'import' && (
            <div className="space-y-4">
              <p className="text-chrome-muted">How would you like to import dialogue?</p>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-4 bg-chrome-bg rounded border border-chrome-border cursor-pointer hover:border-accent-primary">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'automatic'}
                    onChange={() => setImportMode('automatic')}
                    className="mt-1 accent-accent-primary"
                  />
                  <div>
                    <div className="font-medium">Automatic Transcription</div>
                    <div className="text-sm text-chrome-muted">
                      Use AI to automatically transcribe and segment the audio
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 bg-chrome-bg rounded border border-chrome-border cursor-pointer hover:border-accent-primary">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'csv'}
                    onChange={() => setImportMode('csv')}
                    className="mt-1 accent-accent-primary"
                  />
                  <div className="flex-1">
                    <div className="font-medium">Import from CSV</div>
                    <div className="text-sm text-chrome-muted">
                      Import existing transcript with timestamps
                    </div>
                    {importMode === 'csv' && (
                      <button
                        onClick={handleSelectCsv}
                        className="mt-2 px-3 py-1.5 text-sm bg-chrome-hover rounded hover:bg-chrome-active"
                      >
                        {csvPath ? csvPath.split('/').pop() : 'Select CSV file'}
                      </button>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-chrome-border">
          <div>
            {step !== 'video' && (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-chrome-muted hover:text-chrome-text"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-chrome-muted hover:text-chrome-text"
            >
              Cancel
            </button>
            {step === 'video' && (
              <button
                onClick={handleSelectVideo}
                className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded"
              >
                Select Video
              </button>
            )}
            {step === 'language' && (
              <button
                onClick={() => setStep('import')}
                disabled={!projectName}
                className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded disabled:opacity-50"
              >
                Next
              </button>
            )}
            {step === 'import' && (
              <button
                onClick={handleCreate}
                disabled={isLoading || (importMode === 'csv' && !csvPath)}
                className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                Create Project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
