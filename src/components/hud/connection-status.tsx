'use client'

import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'
import { Button } from '@/components/ui/button'

interface ConnectionStatusProps {
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
  onReconnect?: () => void
}

export function ConnectionStatus({ 
  isConnected, 
  onConnect, 
  onDisconnect, 
  onReconnect 
}: ConnectionStatusProps) {
  const t = useTranslations('common')
  const { connection } = useMissionControl()
  const displayUrl = connection.url || 'ws://<gateway-host>:<gateway-port>'
  const isGatewayOptional = process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL === 'true'

  const getStatusColor = () => {
    if (isConnected) return 'bg-green-500 animate-pulse'
    if (connection.reconnectAttempts > 0) return 'bg-yellow-500'
    if (isGatewayOptional && !isConnected) return 'bg-blue-500'
    return 'bg-red-500'
  }

  const getStatusText = () => {
    if (isConnected) {
      return t('connected')
    }
    if (connection.reconnectAttempts > 0) {
      return t('reconnecting', { attempts: connection.reconnectAttempts, max: 10 })
    }
    if (isGatewayOptional && !isConnected) {
      return t('gatewayOptionalStandalone')
    }
    return t('disconnected')
  }

  return (
    <div className="flex items-center space-x-4">
      {/* Connection Status Indicator */}
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
        <span className="text-sm font-medium">
          {getStatusText()}
        </span>
        <span className="text-xs text-muted-foreground">
          {displayUrl}
        </span>
      </div>

      {/* Connection Controls */}
      <div className="flex items-center space-x-2">
        {isConnected ? (
          <Button
            variant="destructive"
            size="xs"
            onClick={onDisconnect}
            title={t('disconnectFromGateway')}
          >
            {t('disconnect')}
          </Button>
        ) : connection.reconnectAttempts > 0 ? (
          <Button
            variant="outline"
            size="xs"
            onClick={onDisconnect}
            className="bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30"
            title={t('cancelReconnection')}
          >
            {t('cancel')}
          </Button>
        ) : (
          <div className="flex space-x-1">
            <Button
              variant="success"
              size="xs"
              onClick={onConnect}
              title={t('connectToGateway')}
            >
              {t('connect')}
            </Button>
            {onReconnect && (
              <Button
                variant="outline"
                size="xs"
                onClick={onReconnect}
                className="bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30"
                title={t('reconnectFreshSession')}
              >
                {t('reconnect')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Real-time Status */}
      <div className="flex items-center space-x-2 text-xs text-muted-foreground">
        {connection.latency ? (
          <>
            <span>{t('latency')}:</span>
            <span className="font-mono">{connection.latency}ms</span>
          </>
        ) : connection.lastConnected ? (
          <>
            <span>{t('lastConnected')}:</span>
            <span className="font-mono">
              {new Date(connection.lastConnected).toLocaleTimeString()}
            </span>
          </>
        ) : (
          <>
            <span>{t('status')}:</span>
            <span className="font-mono">{t('notConnected')}</span>
          </>
        )}
      </div>
    </div>
  )
}
