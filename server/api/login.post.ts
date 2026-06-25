import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'

const _invalidCredentialsError = createError({
  statusCode: 401,
  message: 'Invalid credentials',
})

const _passwordLoginDisabledError = createError({
  statusCode: 403,
  message: 'Password login is disabled',
})

const isEnabled = (value: unknown) =>
  value === true || value === 'true' || value === 1 || value === '1'

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event) as any
  const passwordLoginEnabled = await settingsManager.get<boolean>(
    'system',
    'auth.password.enabled' as any,
    isEnabled(runtimeConfig.public?.auth?.password?.enabled ?? true),
  )

  if (!isEnabled(passwordLoginEnabled)) {
    throw _passwordLoginDisabledError
  }

  const db = useDB()
  const { email, password } = await readValidatedBody(
    event,
    z.object({
      email: z.email(),
      password: z.string().min(6),
    }).parse,
  )

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .get()

  if (!user) {
    throw _invalidCredentialsError
  }

  if (!(await verifyPassword(user.password || '', password))) {
    throw _invalidCredentialsError
  }

  await setUserSession(
    event,
    { user },
    {
      cookie: {
        // secure: !useRuntimeConfig().allowInsecureCookie,
        secure: false,
      },
    },
  )

  return setResponseStatus(event, 201)
})
