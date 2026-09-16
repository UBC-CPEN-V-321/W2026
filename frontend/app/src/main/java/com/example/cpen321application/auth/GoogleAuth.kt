package com.example.cpen321application.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

data class GoogleUser(
    val displayName: String?,
    val givenName: String?,
    val familyName: String?,
    val email: String?,
    val idToken: String
)

// Credential Manager + Google ID is the currently recommended Google Sign-In
// path on Android, replacing the deprecated GoogleSignInClient API.
suspend fun signInWithGoogle(context: Context, serverClientId: String): Result<GoogleUser> {
    return try {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        val response = CredentialManager.create(context).getCredential(context, request)
        val credential = response.credential

        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
            Result.success(
                GoogleUser(
                    displayName = googleIdTokenCredential.displayName,
                    givenName = googleIdTokenCredential.givenName,
                    familyName = googleIdTokenCredential.familyName,
                    email = googleIdTokenCredential.id,
                    idToken = googleIdTokenCredential.idToken
                )
            )
        } else {
            Result.failure(IllegalStateException("Unexpected credential type: ${credential.type}"))
        }
    } catch (e: GetCredentialException) {
        Result.failure(e)
    } catch (e: GoogleIdTokenParsingException) {
        Result.failure(e)
    }
}
