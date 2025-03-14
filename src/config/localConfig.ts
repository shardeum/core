interface LocalConfig {
    verticalScalingMode_enabled: boolean
    verticalScalingMode_path: string
    verticalScalingMode_shutdown_mode: 'sleep' | 'shutdown'
}

export const localConfig: LocalConfig = {
    verticalScalingMode_enabled: false || process.env.VERTICALSCALING_ENABLED === 'true',
    verticalScalingMode_path: '/home/node/config' || process.env.VERTICALSCALING_PATH,
    verticalScalingMode_shutdown_mode: process.env.VERTICALSCALING_SHUTDOWN_MODE === 'sleep' ? 'sleep' : 'shutdown'
}
