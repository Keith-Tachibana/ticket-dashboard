import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import TicketDashboard from './components/TicketDashboard';
import { ITicketDashboardProps } from './components/ITicketDashboardProps';

export interface ITicketDashboardWebPartProps {
  functionBaseUrl: string;
  functionKey: string;
  boardId: string;
}

export default class TicketDashboardWebPart extends BaseClientSideWebPart<ITicketDashboardWebPartProps> {

  public render(): void {
    const element: React.ReactElement<ITicketDashboardProps> = React.createElement(
      TicketDashboard,
      {
        functionBaseUrl: this.properties.functionBaseUrl,
        functionKey: this.properties.functionKey,
        boardId: this.properties.boardId
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: { description: 'Connect to your NinjaOne ticket proxy' },
          groups: [
            {
              groupName: 'Function settings',
              groupFields: [
                PropertyPaneTextField('functionBaseUrl', {
                  label: 'Proxy base URL',
                  description: 'e.g. https://your-site.netlify.app/.netlify/functions/ninja'
                }),
                PropertyPaneTextField('functionKey', {
                  label: 'Proxy shared key',
                  description: 'Matches PROXY_SHARED_KEY on the proxy — sent as a header, never stored in the page HTML'
                }),
                PropertyPaneTextField('boardId', {
                  label: 'Board ID (optional)',
                  description: 'Leave blank to use the first board NinjaOne returns'
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
