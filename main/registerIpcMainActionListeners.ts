import { app, dialog, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs/promises';
import path from 'path';
import databaseManager from '../backend/database/manager';
import { Main } from '../main';
import { getUrlAndTokenString, sendError } from '../src/contactMothership';
import { getLanguageMap } from '../src/getLanguageMap';
import saveHtmlAsPdf from '../src/saveHtmlAsPdf';
import { DatabaseMethod } from '../utils/db/types';
import { DatabaseResponse } from '../utils/ipc/types';
import { IPC_ACTIONS } from '../utils/messages';

export default function registerIpcMainActionListeners(main: Main) {
  ipcMain.handle(IPC_ACTIONS.TOGGLE_MAXIMIZE_CURRENT_WINDOW, (event) => {
    const maximized = main.mainWindow!.isFullScreen();
    if (maximized) {
      main.mainWindow?.setFullScreen(false);
      main.mainWindow?.setSize(main.WIDTH, main.HEIGHT, true);
    } else {
      main.mainWindow?.setFullScreen(true);
    }
    return maximized;
  });

  ipcMain.handle(IPC_ACTIONS.GET_OPEN_FILEPATH, async (event, options) => {
    return await dialog.showOpenDialog(main.mainWindow!, options);
  });

  ipcMain.handle(IPC_ACTIONS.GET_SAVE_FILEPATH, async (event, options) => {
    return await dialog.showSaveDialog(main.mainWindow!, options);
  });

  ipcMain.handle(IPC_ACTIONS.GET_DIALOG_RESPONSE, async (event, options) => {
    if (main.isDevelopment || main.isLinux) {
      Object.assign(options, { icon: main.icon });
    }

    return await dialog.showMessageBox(main.mainWindow!, options);
  });

  ipcMain.handle(IPC_ACTIONS.SHOW_ERROR, async (event, { title, content }) => {
    return await dialog.showErrorBox(title, content);
  });

  ipcMain.handle(
    IPC_ACTIONS.SAVE_HTML_AS_PDF,
    async (event, html, savePath) => {
      return await saveHtmlAsPdf(html, savePath);
    }
  );

  ipcMain.handle(IPC_ACTIONS.SAVE_DATA, async (event, data, savePath) => {
    return await fs.writeFile(savePath, data, { encoding: 'utf-8' });
  });

  ipcMain.handle(IPC_ACTIONS.SEND_ERROR, (event, bodyJson) => {
    sendError(bodyJson);
  });

  ipcMain.handle(IPC_ACTIONS.CHECK_FOR_UPDATES, (event, force) => {
    if (!main.isDevelopment && !main.checkedForUpdate) {
      autoUpdater.checkForUpdates();
    } else if (force) {
      autoUpdater.checkForUpdates();
    }
  });

  ipcMain.handle(IPC_ACTIONS.GET_LANGUAGE_MAP, async (event, code) => {
    const obj = { languageMap: {}, success: true, message: '' };
    try {
      obj.languageMap = await getLanguageMap(code, main.isDevelopment);
    } catch (err) {
      obj.success = false;
      obj.message = (err as Error).message;
    }

    return obj;
  });

  ipcMain.handle(IPC_ACTIONS.GET_FILE, async (event, options) => {
    const response = {
      name: '',
      filePath: '',
      success: false,
      data: Buffer.from('', 'utf-8'),
      canceled: false,
    };
    const { filePaths, canceled } = await dialog.showOpenDialog(
      main.mainWindow!,
      options
    );

    response.filePath = filePaths?.[0];
    response.canceled = canceled;

    if (!response.filePath) {
      return response;
    }

    response.success = true;
    if (canceled) {
      return response;
    }

    response.name = path.basename(response.filePath);
    response.data = await fs.readFile(response.filePath);
    return response;
  });

  ipcMain.handle(IPC_ACTIONS.GET_CREDS, async (event) => {
    return await getUrlAndTokenString();
  });

  ipcMain.handle(IPC_ACTIONS.GET_VERSION, (_) => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_ACTIONS.DELETE_FILE, async (_, filePath) => {
    await fs.unlink(filePath);
  });

  /**
   * Database Related Actions
   */

  ipcMain.handle(
    IPC_ACTIONS.DB_CREATE,
    async (_, dbPath: string, countryCode: string) => {
      const response: DatabaseResponse = { error: '', data: undefined };
      try {
        response.data = await databaseManager.createNewDatabase(
          dbPath,
          countryCode
        );
      } catch (error) {
        response.error = (error as Error).toString();
      }

      return response;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CONNECT,
    async (_, dbPath: string, countryCode?: string) => {
      const response: DatabaseResponse = { error: '', data: undefined };
      try {
        response.data = await databaseManager.connectToDatabase(
          dbPath,
          countryCode
        );
      } catch (error) {
        response.error = (error as Error).toString();
      }

      return response;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CALL,
    async (_, method: DatabaseMethod, ...args: unknown[]) => {
      const response: DatabaseResponse = { error: '', data: undefined };
      try {
        response.data = await databaseManager.call(method, ...args);
      } catch (error) {
        response.error = (error as Error).toString();
      }

      return response;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_BESPOKE,
    async (_, method: string, ...args: unknown[]) => {
      const response: DatabaseResponse = { error: '', data: undefined };
      try {
        response.data = await databaseManager.callBespoke(method, ...args);
      } catch (error) {
        response.error = (error as Error).toString();
      }

      return response;
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_SCHEMA, async (_) => {
    const response: DatabaseResponse = { error: '', data: undefined };
    response.data = await databaseManager.getSchemaMap();
    return response;
  });
}
