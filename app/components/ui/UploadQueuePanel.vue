<script lang="ts" setup>
import { motion, AnimatePresence } from 'motion-v'

interface UploadFile {
  file: File
  fileName: string
  fileId: string
  status:
    | 'waiting'
    | 'preparing'
    | 'uploading'
    | 'processing'
    | 'completed'
    | 'error'
    | 'skipped'
    | 'blocked'
  stage?: string | null
  progress?: number
  error?: string
  taskId?: number
  uploadProgress?: {
    loaded: number
    total: number
    percentage: number
    speed?: number
    timeRemaining?: number
    speedText?: string
    timeRemainingText?: string
  }
  canAbort?: boolean
  abortUpload?: () => void
}

const props = defineProps<{
  uploadingFiles: Map<string, UploadFile>
  collapsed?: boolean
}>()

const emit = defineEmits<{
  removeFile: [fileId: string]
  clearCompleted: []
  clearAll: []
  toggle: []
  goToQueue: []
}>()

const isCollapsed = ref(props.collapsed || false)

// Compute upload status counts.
const stats = computed(() => {
  const files = Array.from(props.uploadingFiles.values())
  return {
    total: files.length,
    waiting: files.filter((f) => f.status === 'waiting').length,
    uploading: files.filter((f) => f.status === 'uploading').length,
    processing: files.filter((f) => f.status === 'processing').length,
    completed: files.filter((f) => f.status === 'completed').length,
    error: files.filter((f) => f.status === 'error').length,
    skipped: files.filter((f) => f.status === 'skipped').length,
    blocked: files.filter((f) => f.status === 'blocked').length,
    active: files.filter(
      (f) => f.status === 'uploading' || f.status === 'processing',
    ).length,
    pending: files.filter(
      (f) => f.status === 'waiting' || f.status === 'preparing',
    ).length,
  }
})

// Compute overall progress.
const overallProgress = computed(() => {
  const files = Array.from(props.uploadingFiles.values())
  if (files.length === 0) return 0

  let totalProgress = 0
  files.forEach((file) => {
    if (file.status === 'completed') {
      // Completed files count as 100%.
      totalProgress += 100
    } else if (file.status === 'uploading' && file.progress !== undefined) {
      // Uploading contributes 70% of the total file progress.
      totalProgress += file.progress * 0.7
    } else if (file.status === 'processing') {
      // Processing starts after upload completion.
      totalProgress += 70
    } else if (file.status === 'preparing') {
      // Preparing starts at 0%.
      totalProgress += 0
    } else if (file.status === 'waiting') {
      // Waiting starts at 0%.
      totalProgress += 0
    } else if (file.status === 'skipped' || file.status === 'blocked') {
      // Skipped or blocked files do not contribute to progress.
      totalProgress += 0
    }
  })

  return Math.round(totalProgress / files.length)
})

// Compute overall status color.
const statusColor = computed(() => {
  if (stats.value.error > 0 || stats.value.blocked > 0) return 'error'
  if (stats.value.active > 0) return 'primary'
  if (stats.value.skipped > 0 && stats.value.active === 0) return 'warning'
  if (stats.value.completed > 0 && stats.value.active === 0) return 'success'
  return 'neutral'
})

// Toggle collapsed state.
const toggleCollapsed = () => {
  isCollapsed.value = !isCollapsed.value
  emit('toggle')
}

// Clear completed files.
const clearCompletedFiles = () => {
  emit('clearCompleted')
}

// Clear all files.
const clearAllFiles = () => {
  emit('clearAll')
}

</script>

<template>
  <div
    v-if="uploadingFiles.size > 0"
    class="fixed bottom-2 inset-x-2 sm:inset-x-6 sm:bottom-6 sm:left-auto z-50 min-w-sm sm:w-md"
  >
    <motion.div
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden"
      :initial="{ opacity: 0, y: 100, scale: 0.9 }"
      :animate="{ opacity: 1, y: 0, scale: 1 }"
      :exit="{ opacity: 0, y: 100, scale: 0.9 }"
      :transition="{ duration: 0.4, ease: 'backOut' }"
      layout
    >
      <!-- Header -->
      <motion.div
        class="p-4 border-b border-neutral-200 dark:border-neutral-700 cursor-pointer"
        :while-hover="{ backgroundColor: 'rgba(0,0,0,0.02)' }"
        :while-tap="{ scale: 0.98 }"
        @click="toggleCollapsed"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <!-- Status indicator -->
            <Icon
              :name="
                {
                  primary: 'tabler:upload',
                  success: 'tabler:circle-check',
                  error: 'tabler:alert-circle',
                  warning: 'tabler:alert-triangle',
                  neutral: 'tabler:info-circle',
                }[statusColor]
              "
              class="size-5"
              :class="{
                'text-blue-600 dark:text-blue-400': statusColor === 'primary',
                'text-green-600 dark:text-green-400': statusColor === 'success',
                'text-red-600 dark:text-red-400': statusColor === 'error',
                'text-yellow-600 dark:text-yellow-400':
                  statusColor === 'warning',
                'text-neutral-600 dark:text-neutral-400':
                  statusColor === 'neutral',
              }"
            />

            <!-- Title and stats -->
            <div>
              <h3
                class="font-semibold text-sm text-neutral-900 dark:text-neutral-100"
              >
                {{ $t('dashboard.photos.uploadQueue.title') }}
                <span class="text-neutral-500 dark:text-neutral-400">
                  ({{ stats.total }})
                </span>
              </h3>

              <div
                class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-1"
              >
                <span
                  v-if="stats.waiting > 0"
                  class="text-neutral-600 dark:text-neutral-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.waiting', {
                      count: stats.waiting,
                    })
                  }}
                </span>
                <span
                  v-if="stats.active > 0"
                  class="text-blue-600 dark:text-blue-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.active', {
                      count: stats.active,
                    })
                  }}
                </span>
                <span
                  v-if="stats.completed > 0"
                  class="text-green-600 dark:text-green-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.completed', {
                      count: stats.completed,
                    })
                  }}
                </span>
                <span
                  v-if="stats.error > 0"
                  class="text-red-600 dark:text-red-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.error', {
                      count: stats.error,
                    })
                  }}
                </span>
                <span
                  v-if="stats.skipped > 0"
                  class="text-yellow-600 dark:text-yellow-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.skipped', {
                      count: stats.skipped,
                    })
                  }}
                </span>
                <span
                  v-if="stats.blocked > 0"
                  class="text-red-600 dark:text-red-400"
                >
                  {{
                    $t('dashboard.photos.uploadQueue.stats.blocked', {
                      count: stats.blocked,
                    })
                  }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Overall progress -->
            <div
              v-if="stats.active > 0"
              class="text-xs text-neutral-500 dark:text-neutral-400 font-mono"
            >
              {{ overallProgress }}%
            </div>

            <!-- Collapse icon -->
            <motion.div
              :animate="{ rotate: isCollapsed ? 0 : 180 }"
              :transition="{ duration: 0.3 }"
            >
              <Icon
                name="tabler:chevron-down"
                class="size-5 text-neutral-500 dark:text-neutral-400 block"
              />
            </motion.div>
          </div>
        </div>

        <!-- Overall progress bar -->
        <motion.div
          v-if="stats.active > 0"
          class="mt-3"
          :initial="{ opacity: 0, scaleX: 0 }"
          :animate="{ opacity: 1, scaleX: 1 }"
          :exit="{ opacity: 0, scaleX: 0 }"
          :transition="{ duration: 0.3 }"
          style="transform-origin: left"
        >
          <UProgress
            :model-value="overallProgress"
            :color="statusColor"
          />
        </motion.div>
      </motion.div>

      <!-- File list -->
      <AnimatePresence>
        <motion.div
          v-if="!isCollapsed"
          :initial="{ height: 0, opacity: 0 }"
          :animate="{ height: 'auto', opacity: 1 }"
          :exit="{ height: 0, opacity: 0 }"
          :transition="{ duration: 0.3, ease: 'easeInOut' }"
          class="max-h-[calc(100vh-25.3rem)] sm:max-h-150 overflow-hidden overflow-y-auto filelist-container"
        >
          <div class="p-2 space-y-2">
            <AnimatePresence mode="popLayout">
              <UploadQueueItem
                v-for="[fileId, uploadingFile] in uploadingFiles"
                :key="fileId"
                :uploading-file="uploadingFile"
                :file-id="fileId"
                @remove-file="emit('removeFile', $event)"
              />
            </AnimatePresence>
          </div>
        </motion.div>
      </AnimatePresence>

      <!-- Footer actions -->
      <AnimatePresence>
        <motion.div
          v-if="
            !isCollapsed &&
              (
                stats.completed > 0 ||
                stats.error > 0 ||
                stats.skipped > 0 ||
                stats.blocked > 0
              )
          "
          :initial="{ opacity: 0, scaleY: 0 }"
          :animate="{ opacity: 1, scaleY: 1 }"
          :exit="{ opacity: 0, scaleY: 0 }"
          :transition="{ duration: 0.3 }"
          style="transform-origin: bottom"
          class="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              {{
                $t('dashboard.photos.uploadQueue.summary', {
                  completed: stats.completed,
                  error: stats.error,
                  skipped: stats.skipped,
                  blocked: stats.blocked,
                })
              }}
            </div>

            <div class="flex items-center gap-0.5">
              <UButton
                v-if="stats.completed > 0"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="clearCompletedFiles"
              >
                {{ $t('dashboard.photos.uploadQueue.clearCompleted') }}
              </UButton>

              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="tabler:trash"
                @click="clearAllFiles"
              >
                {{ $t('dashboard.photos.uploadQueue.clearAll') }}
              </UButton>

              <UButton
                size="xs"
                variant="ghost"
                color="info"
                icon="tabler:list-check"
                @click="emit('goToQueue')"
              >
                {{ $t('title.queue') }}
              </UButton>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  </div>
</template>

<style scoped>
/* Scrollbar styles */
.filelist-container::-webkit-scrollbar {
  width: 4px;
}

.filelist-container::-webkit-scrollbar-track {
  background: transparent;
}

.filelist-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.dark .filelist-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}
</style>
