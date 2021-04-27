import { Params } from '@feathersjs/feathers';
// import { EncryptedPresentation, Presentation, PresentationReceiptInfo } from '@unumid/types';
import { NoPresentation, Presentation, EncryptedPresentation, PresentationReceiptInfo } from '@unumid/types-deprecated';
import { Service as MikroOrmService } from 'feathers-mikro-orm';

import { Application } from '../../../declarations';
import { NoPresentationEntity, NoPresentationEntityOptions } from '../../../entities/NoPresentation';
import { PresentationEntity, PresentationEntityOptions } from '../../../entities/Presentation';
import logger from '../../../logger';
import { BadRequest, NotFound } from '@feathersjs/errors';
import { PresentationRequestEntity } from '../../../entities/PresentationRequest';
import { CryptoError } from '@unumid/library-crypto';
// import { CredentialInfo, DecryptedPresentation, extractCredentialInfo, verifyPresentation } from '@unumid/server-sdk';
import { DecryptedPresentation, verifyPresentation, extractCredentialInfo, CredentialInfo } from '@unumid/server-sdk-deprecated';
import { WithVersion } from '@unumid/demo-types';
import { VerificationResponse } from '@unumid/demo-types-deprecated';
import { lt } from 'semver';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ServiceOptions { }

export interface PresentationWithVerificationDeprecated {
  presentation: Presentation;
  isVerified: boolean;
}

export interface NoPresentationWithVerificationDeprecated {
  noPresentation: NoPresentation;
  isVerified: boolean;
}

export interface PresentationWithVerification {
  presentation: Presentation;
  isVerified: boolean;
}

const makePresentationEntityOptionsFromPresentation = (
  { presentation, isVerified }: PresentationWithVerification
): PresentationEntityOptions => {
  const {
    '@context': presentationContext,
    type: presentationType,
    proof: presentationProof,
    presentationRequestUuid: presentationPresentationRequestUuid,
    verifierDid
  } = presentation;

  const presentationVerifiableCredentials = presentation.verifiableCredentials ? presentation.verifiableCredentials : [];

  return {
    presentationContext,
    presentationType,
    presentationVerifiableCredentials,
    presentationProof,
    presentationPresentationRequestUuid,
    isVerified,
    verifierDid
  };
};

const makeNoPresentationEntityOptionsFromNoPresentation = (
  { noPresentation, isVerified }: NoPresentationWithVerificationDeprecated
): NoPresentationEntityOptions => {
  const {
    type: npType,
    proof: npProof,
    holder: npHolder,
    presentationRequestUuid: npPresentationRequestUuid
  } = noPresentation;

  return {
    npType,
    npProof,
    npHolder,
    npPresentationRequestUuid,
    isVerified
  };
};

// const makeNoPresentationEntityOptionsFromNoPresentation = (
//   { presentation, isVerified }: PresentationWithVerification
// ): NoPresentationEntityOptions => {
//   const {
//     type: npType,
//     proof: npProof,
//     // holder: npHolder,
//     presentationRequestUuid: npPresentationRequestUuid
//   } = presentation;

//   return {
//     npType,
//     npProof,
//     npHolder: undefined,
//     npPresentationRequestUuid,
//     isVerified
//   };
// };

export class PresentationService {
  app: Application;
  options: ServiceOptions;
  presentationDataService: MikroOrmService<PresentationEntity>;
  noPresentationDataService: MikroOrmService<NoPresentationEntity>;

  constructor (options: ServiceOptions = {}, app: Application) {
    this.options = options;
    this.app = app;
    this.presentationDataService = app.service('presentationData');
    this.noPresentationDataService = app.service('noPresentationData');
  }

  async createPresentationEntity (presentation: DecryptedPresentation, params?: Params): Promise<PresentationEntity> {
    const decryptedPresentation: Presentation = presentation.presentation as Presentation;
    const presentationWithVerification: PresentationWithVerificationDeprecated = { isVerified: presentation.isVerified, presentation: decryptedPresentation };
    const options = makePresentationEntityOptionsFromPresentation(presentationWithVerification);
    try {
      return this.presentationDataService.create(options, params);
    } catch (e) {
      logger.error('PresentationService.createPresentationEntity caught an error thrown by PresentationDataService.create', e);
      throw e;
    }
  }

  async createNoPresentationEntity (noPresentation: DecryptedPresentation, params?: Params): Promise<NoPresentationEntity> {
    const decryptedPresentation: NoPresentation = noPresentation.presentation as NoPresentation;
    const noPresentationWithVerification: NoPresentationWithVerificationDeprecated = { isVerified: noPresentation.isVerified, noPresentation: decryptedPresentation };
    const options = makeNoPresentationEntityOptionsFromNoPresentation(noPresentationWithVerification);
    try {
      return this.noPresentationDataService.create(options, params);
    } catch (e) {
      logger.error('PresentationService.crateNoPresentationEntity caught an error thrown by NoPresentationDataService.create', e);
      throw e;
    }
  }

  // async createNoPresentationEntity (noPresentation: DecryptedPresentation, params?: Params): Promise<NoPresentationEntity> {
  //   const decryptedPresentation: Presentation = noPresentation.presentation as Presentation;
  //   const noPresentationWithVerification: PresentationWithVerification = { isVerified: noPresentation.isVerified, presentation: decryptedPresentation };
  //   const options = makeNoPresentationEntityOptionsFromNoPresentation(noPresentationWithVerification);
  //   try {
  //     return this.noPresentationDataService.create(options, params);
  //   } catch (e) {
  //     logger.error('PresentationService.crateNoPresentationEntity caught an error thrown by NoPresentationDataService.create', e);
  //     throw e;
  //   }
  // }

  // async createPresentationEntity (presentation: DecryptedPresentation, params?: Params): Promise<PresentationEntity> {
  //   const decryptedPresentation: Presentation = presentation.presentation as Presentation;
  //   const presentationWithVerification: PresentationWithVerification = { isVerified: presentation.isVerified, presentation: decryptedPresentation };
  //   const options = makePresentationEntityOptionsFromPresentation(presentationWithVerification);
  //   try {
  //     return this.presentationDataService.create(options, params);
  //   } catch (e) {
  //     logger.error('PresentationService.createPresentationEntity caught an error thrown by PresentationDataService.create', e);
  //     throw e;
  //   }
  // }

  async create (
    data: WithVersion<EncryptedPresentation>,
    params?: Params
  ): Promise<VerificationResponse> {
    try {
      const presentationRequestService = this.app.service('presentationRequestData');
      const presentationRequest: PresentationRequestEntity = await presentationRequestService.findOne({ prUuid: data.presentationRequestInfo.presentationRequest.uuid });
      const presentationWebsocketService = this.app.service('presentationWebsocket');
      const presentationServiceV2 = this.app.service('presentationV2');

      if (!presentationRequest) {
        throw new NotFound('PresentationRequest not found.');
      }

      const verifierDataService = this.app.service('verifierData');
      const verifier = await verifierDataService.getDefaultVerifierEntity();

      // Needed to roll over the old attribute value that wasn't storing the Bearer as part of the token. Ought to remove once the roll over is complete. Figured simple to enough to just handle in app code.
      const authToken = verifier.authToken.startsWith('Bearer ') ? verifier.authToken : `Bearer ${verifier.authToken}`;

      // if request is made with version header 2.0.0+ then use the new server-sdk other wise use the old
      if (lt(data.version, '2.0.0')) {
        const response = await verifyPresentation(authToken, data.encryptedPresentation, verifier.verifierDid, verifier.encryptionPrivateKey, data.presentationRequestInfo);
        const result: DecryptedPresentation = response.body;

        logger.info(`response from server sdk ${JSON.stringify(result)}`);

        // need to update the verifier auth token
        await verifierDataService.patch(verifier.uuid, { authToken: response.authToken });

        // return early if the presentation could not be verified
        if (!result.isVerified) {
          logger.warn(`Presentation verification failed: ${result.message}`);
          throw new BadRequest(`Verification failed: ${result.message ? result.message : ''}`);
        }

        if (result.type === 'VerifiablePresentation') {
          try {
            // Persist the Presentation entity and add the version for the websocket handler
            const entity = {
              ...await this.createPresentationEntity(result, params),
              version: data.version
            };

            // Pass the Presentation entity to the websocket service for the web client's consumption
            presentationWebsocketService.create(entity);
          } catch (e) {
            logger.error('PresentationService.create caught an error thrown by PresentationService.createPresentationEntity', e);
            throw e;
          }
        } else {
          try {
            // Create and persist the NoPresentation entity
            const entity = await this.createNoPresentationEntity(result, params);

            // Pass the Presentation entity with version to the websocket service for the web client's consumption
            presentationWebsocketService.create(entity);
          } catch (e) {
            logger.error('PresentationService.create caught an error thrown by PresentationService.createNoPresentationEntity', e);
            throw e;
          }
        }

        // extract the relevant credential info to send back to UnumID SaaS for analytics.
        const decryptedPresentation: Presentation = result.presentation as Presentation;
        const credentialInfo: CredentialInfo = extractCredentialInfo((decryptedPresentation));

        const presentationReceiptInfo: PresentationReceiptInfo = {
          subjectDid: credentialInfo.subjectDid,
          credentialTypes: credentialInfo.credentialTypes,
          verifierDid: verifier.verifierDid,
          holderApp: (response.body.presentation as NoPresentation).holder,
          issuers: result.type === 'VerifiablePresentation' ? presentationRequest.prIssuerInfo : undefined
        };

        logger.info(`Handled encrypted presentation of type ${result.type}${result.type === 'VerifiablePresentation' ? ` with credentials [${credentialInfo.credentialTypes}]` : ''} for subject ${credentialInfo.subjectDid}`);

        return { isVerified: true, type: result.type, presentationReceiptInfo, presentationRequestUuid: data.presentationRequestInfo.presentationRequest.uuid };
      } else { // request was made with version header 2.0.0+
        // const PresentationServiceV2 = this.app.service('presentationServiceV2');
        return await presentationServiceV2.create(data, params);
        // // TODO make another service which is just called here, presentationV2 or something like that.
        // const response = await verifyPresentation(authToken, data.encryptedPresentation, verifier.verifierDid, verifier.encryptionPrivateKey, data.presentationRequestInfo);
        // const result: DecryptedPresentation = response.body;

        // logger.info(`response from server sdk ${JSON.stringify(result)}`);

        // // need to update the verifier auth token
        // await verifierDataService.patch(verifier.uuid, { authToken: response.authToken });

        // // return early if the presentation could not be verified
        // if (!result.isVerified) {
        //   logger.warn(`Presentation verification failed: ${result.message}`);
        //   throw new BadRequest(`Verification failed: ${result.message ? result.message : ''}`);
        // }

        // if (result.type === 'VerifiablePresentation') {
        //   try {
        //   // Create and persist the Presentation entity
        //     const entity = await this.createPresentationEntity(result, params);

        //     // Pass the Presentation entity to the websocket service for the web client's consumption
        //     presentationWebsocketService.create(entity);
        //   } catch (e) {
        //     logger.error('PresentationService.create caught an error thrown by PresentationService.createPresentationEntity', e);
        //     throw e;
        //   }
        // } else {
        //   logger.info('Presentation was declined, not storing.');
        // }

        // // extract the relevant credential info to send back to UnumID SaaS for analytics.
        // const decryptedPresentation: Presentation = result.presentation as Presentation;
        // const credentialInfo: CredentialInfo = extractCredentialInfo((decryptedPresentation));

        // const presentationReceiptInfo: PresentationReceiptInfo = {
        //   subjectDid: credentialInfo.subjectDid,
        //   credentialTypes: credentialInfo.credentialTypes,
        //   verifierDid: verifier.verifierDid,
        //   holderApp: data.presentationRequestInfo.presentationRequest.holderAppUuid,
        //   issuers: result.type === 'VerifiablePresentation' ? presentationRequest.prIssuerInfo : undefined
        // };

        // logger.info(`Handled encrypted presentation of type ${result.type}${result.type === 'VerifiablePresentation' ? ` with credentials [${credentialInfo.credentialTypes}]` : ''} for subject ${credentialInfo.subjectDid}`);

        // return { isVerified: true, type: result.type, presentationReceiptInfo, presentationRequestUuid: data.presentationRequestInfo.presentationRequest.uuid };
      }
    } catch (error) {
      if (error instanceof CryptoError) {
        logger.error('Crypto error handling encrypted presentation', error);
      } else {
        logger.error('Error handling encrypted presentation request to UnumID Saas.', error);
      }

      throw error;
    }
  }
}
