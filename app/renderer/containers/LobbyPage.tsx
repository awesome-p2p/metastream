import React, { Component } from 'react'
import { connect } from 'react-redux'
import { RouteComponentProps } from 'react-router'
import { createStore, Store } from 'redux'
import { IReactReduxProps } from 'types/redux'

import { IAppState, AppReplicatedState } from 'renderer/reducers'

import { NetworkState } from 'types/network'
import { Lobby } from 'renderer/components/Lobby'
import { GameLobby } from 'renderer/components/GameLobby'
import { PlatformService } from 'renderer/platform'
import { NetServer } from 'renderer/network'
import { NetActions } from 'renderer/network/actions'
import { ReplicatedState } from 'renderer/network/types'
import { push } from 'react-router-redux'
import { sleep } from 'utils/async'
import { NETWORK_TIMEOUT } from 'constants/network'
import { Connect } from '../components/lobby/Connect'

interface IRouteParams {
  lobbyId: string
}

interface IProps extends RouteComponentProps<IRouteParams> {}

interface IConnectedProps {}

function mapStateToProps(state: IAppState): IConnectedProps {
  return {}
}

type PrivateProps = IProps & IConnectedProps & IReactReduxProps

export class _LobbyPage extends Component<PrivateProps> {
  private connected: boolean = false
  private server?: NetServer
  private host: boolean

  constructor(props: PrivateProps) {
    super(props)

    const lobbyId = props.match.params.lobbyId
    this.host = lobbyId === 'create'
  }

  private async setupLobby(): Promise<void> {
    let successPromise

    if (this.lobbyId) {
      successPromise = PlatformService.joinLobby(this.lobbyId)
    } else {
      successPromise = PlatformService.createLobby({
        p2p: true,
        websocket: true,
        maxMembers: 4
      })
    }

    // TODO: will this reject the promise that loses?
    const result = await Promise.race([successPromise, sleep(NETWORK_TIMEOUT)])

    const success = typeof result === 'boolean' ? result : false

    if (success) {
      this.onJoinLobby(PlatformService.getServer()!)
    } else {
      this.onConnectionFailed()
    }
  }

  private onJoinLobby(server: NetServer): void {
    this.server = server
    this.server.once('close', this.disconnect)

    if (this.host) {
      // Server is ready
      this.onConnection()
    } else {
      this.connectToHost()
    }
  }

  /** Connect client to server */
  private async connectToHost() {
    const peerPromise = new Promise(resolve => {
      if (this.server!.connected) {
        resolve()
      } else {
        this.server!.once('connect', resolve)
      }
    })

    const conn = await Promise.race([peerPromise, sleep(NETWORK_TIMEOUT)])

    if (this.server!.connected) {
      this.onConnection()
    } else {
      this.onConnectionFailed()
    }
  }

  private onConnection(): void {
    this.props.dispatch(
      NetActions.connect({
        server: this.server!,
        host: this.host,
        replicated: AppReplicatedState as ReplicatedState<any>
      })
    )

    this.connected = true
    this.forceUpdate()
  }

  private onConnectionFailed(): void {
    if (this.server) {
      this.disconnect('Failed to join lobby')
    }
  }

  private disconnect = (reason?: string) => {
    // TODO: display reason
    reason = reason || 'Disconnected'
    console.info(reason)
    this.props.dispatch(push('/'))
  }

  componentWillMount(): void {
    this.setupLobby()
  }

  componentWillUnmount(): void {
    if (this.server) {
      this.props.dispatch(NetActions.disconnect())
      PlatformService.leaveLobby(this.lobbyId || '')
      this.server.removeAllListeners()
      this.server.close()
      this.server = undefined
    }
  }

  private get lobbyId(): string | undefined {
    const { match } = this.props
    const lobbyId = match.params.lobbyId
    return lobbyId === 'create' ? undefined : lobbyId
  }

  render(): JSX.Element {
    if (!this.connected) {
      return <Connect onCancel={this.disconnect} />
    }

    return <GameLobby host={this.host} />
  }
}

export const LobbyPage = connect<IConnectedProps, {}, IProps>(mapStateToProps)(_LobbyPage)
