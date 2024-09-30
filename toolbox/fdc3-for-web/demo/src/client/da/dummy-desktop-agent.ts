import { io } from "socket.io-client"
import { v4 as uuid } from 'uuid'
import { APP_GOODBYE, APP_HELLO, DA_HELLO, FDC3_APP_EVENT } from "../../message-types";
import { DemoServerContext } from "./DemoServerContext";
import { FDC3_2_1_JSONDirectory } from "./FDC3_2_1_JSONDirectory";
import { AppRegistration, DefaultFDC3Server, DirectoryApp, ServerContext } from "@kite9/fdc3-web-impl";
import { ChannelState, ChannelType } from "@kite9/fdc3-web-impl/src/handlers/BroadcastHandler";
import { link } from "./util";
import { BrowserTypes } from "@kite9/fdc3-schema";

type WebConnectionProtocol2LoadURL = BrowserTypes.WebConnectionProtocol2LoadURL

function createAppStartButton(app: DirectoryApp, sc: ServerContext<AppRegistration>): HTMLDivElement {
    const div = document.createElement("div") as HTMLDivElement
    div.classList.add("app")
    const h3 = document.createElement("h3")
    h3.textContent = app.title
    div.appendChild(h3)
    const button = document.createElement("button")
    button.textContent = "Start"
    button.onclick = () => sc.open(app.appId)
    div.appendChild(button)
    const p = document.createElement("p")
    p.textContent = app.description ?? ''
    div.appendChild(p)
    return div
}


enum Approach { IFRAME, PARENT_POST_MESSAGE }

function getApproach(): Approach {
    const cb = document.getElementById("approach") as HTMLInputElement;
    const val = cb.value
    var out: Approach = Approach[val as keyof typeof Approach]; //Works with --noImplicitAny
    return out;
}

enum UI { DEFAULT, DEMO }

function getUi(): UI {
    const cb = document.getElementById("ui") as HTMLInputElement;
    const val = cb.value
    var out: UI = UI[val as keyof typeof UI]; //Works with --noImplicitAny
    return out;
}

window.addEventListener("load", () => {

    let desktopAgentUUID = uuid()

    const socket = io()

    socket.on("connect", async () => {
        socket.emit(DA_HELLO, desktopAgentUUID)

        const directory = new FDC3_2_1_JSONDirectory()
        await directory.load("/static/da/appd.json")
        //await directory.load("/static/da/local-conformance-2_0.v2.json")
        //await directory.load("/static/da/training-appd.v2.json")
        const sc = new DemoServerContext(socket, directory)

        const channelDetails: ChannelState[] = [
            { id: "one", type: ChannelType.user, context: [], displayMetadata: { name: "THE RED CHANNEL", color: "red" } },
            { id: "two", type: ChannelType.user, context: [], displayMetadata: { name: "THE BLUE CHANNEL", color: "blue" } },
            { id: "three", type: ChannelType.user, context: [], displayMetadata: { name: "THE GREEN CHANNEL", color: "green" } }
        ]
        const fdc3Server = new DefaultFDC3Server(sc, directory, channelDetails, true, 20000, 10000)

        socket.on(FDC3_APP_EVENT, (msg, from) => {
            console.log(`App Event ${JSON.stringify(msg, null, 2)} from ${from}`)
            fdc3Server.receive(msg, from)
        })

        socket.on(APP_GOODBYE, (id: string) => {
            sc.goodbye(id)
        })

        // let's create buttons for some apps
        const appList = document.getElementById('app-list') as HTMLOListElement
        directory.retrieveAllApps().forEach(app => {
            appList.appendChild(createAppStartButton(app, sc))
        })

        // set up desktop agent handler here using FDC3 Web Loader (or whatever we call it)
        window.addEventListener(
            "message",
            (e) => {
                const event = e as MessageEvent
                const data = event.data;
                const source = event.source as Window
                const origin = event.origin;

                console.log("Received: " + JSON.stringify(event.data));
                if (data.type == "WCP1Hello") {
                    if (getApproach() == Approach.IFRAME) {
                        const instance = sc.getInstanceForWindow(source)
                        source.postMessage({
                            type: "WCP2LoadUrl",
                            meta: {
                                connectionAttemptUuid: data.meta.connectionAttemptUuid,
                                timestamp: new Date()
                            },
                            payload: {
                                iframeUrl: window.location.origin + `/static/da/embed.html?connectionAttemptUuid=${data.meta.connectionAttemptUuid}&desktopAgentId=${desktopAgentUUID}&instanceId=${instance?.instanceId}`
                            }
                        } as WebConnectionProtocol2LoadURL, origin)
                    } else {
                        const instance = sc.getInstanceForWindow(source)!!
                        const channel = new MessageChannel()
                        link(socket, channel, instance.instanceId!!)

                        socket.emit(APP_HELLO, desktopAgentUUID, instance.instanceId)

                        // sned the other end of the channel to the app
                        source.postMessage({
                            type: 'WCP3Handshake',
                            meta: {
                                connectionAttemptUuid: data.meta.connectionAttemptUuid,
                                timestamp: new Date()
                            },
                            payload: {
                                fdc3Version: "2.2",
                                intentResolverUrl: "http://localhost:4000/public/intent_resolver.html",
                                channelSelectorUrl: "http://localhost:4000/public/channel_selector.html"
                            }
                        }, origin, [channel.port1])
                    }
                }
            });
    })



})

