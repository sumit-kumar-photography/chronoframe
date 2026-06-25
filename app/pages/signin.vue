<script lang="ts" setup>
useHead({
  title: $t('auth.form.signin.title'),
})

const { fetch: fetchUserSession } = useUserSession()
const config = useRuntimeConfig()
const settingsStore = useSettingsStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const isLoading = ref(false)

const isEnabled = (value: unknown) =>
  value === true || value === 'true' || value === 1 || value === '1'

const githubOauthEnabled = computed(() => {
  const settingsValue = settingsStore.getSetting('system:auth.github.enabled')

  return (
    isEnabled(settingsValue) || isEnabled(config.public.oauth.github.enabled)
  )
})

const passwordLoginEnabled = computed(() => {
  const settingsValue = settingsStore.getSetting('system:auth.password.enabled')

  if (settingsValue !== null) {
    return isEnabled(settingsValue)
  }

  return isEnabled(config.public.auth?.password?.enabled ?? true)
})

const onAuthSubmit = async (event: any) => {
  if (!passwordLoginEnabled.value) {
    return
  }

  isLoading.value = true
  await $fetch('/api/login', {
    method: 'POST',
    body: event.data,
  })
    .then(async () => {
      await fetchUserSession()
      router.push(route.query.redirect?.toString() || '/')
    })
    .catch((error) => {
      console.error('Login error:', error)
      toast.add({
        color: 'error',
        title: $t('auth.messages.loginFailed.title'),
        description:
          error?.data?.message || $t('auth.messages.loginFailed.description'),
      })
    })
    .finally(() => {
      isLoading.value = false
    })
}
</script>

<template>
  <div
    class="w-full min-h-svh flex flex-col items-center justify-center p-4 pb-12"
  >
    <AuthForm
      :title="$t('auth.form.signin.title')"
      :subtitle="$t('auth.form.signin.subtitle', [config.public.app.title])"
      :loading="isLoading"
      :password-login-enabled="passwordLoginEnabled"
      :providers="[
        githubOauthEnabled && {
          icon: 'tabler:brand-github',
          size: 'lg',
          color: 'neutral',
          variant: 'subtle',
          block: true,
          label: 'GitHub',
          to: '/api/auth/github',
          external: true,
        },
      ]"
      @submit="onAuthSubmit"
    />
  </div>
</template>

<style scoped></style>
