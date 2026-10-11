  
**LOGICS**

**Public API Documentation**

Version 4 (V4) · Endpoint Reference

**Base URL**  
https\://valortax.logiqsapi.com/publicapi/V4/

Prepared: September 26, 2026

# **Contents**

*This document is organized by feature area. Each entry below groups its GET/POST endpoints together.*

| Category | Endpoints | Required Scopes |
| :---- | :---- | :---- |
| Appointment | 4 | case.read / case.write |
| Billing | 10 | payments.read / payments.write |
| Case | 6 | case.read / case.write |
| Case Activity | 3 | case.read / activity.write |
| Documents | 1 | case.write |
| Fax | 1 | fax.write |
| Find | 3 | case.read |
| Report | 1 | reports.activityreport.read |
| Services | 1 | case.read |
| Task | 3 | task.read / task.write |
| User | 1 | user.write |

# **API Authentication Guide**

**Overview**

The Logics Public API uses Basic Authentication to secure all requests. You'll need two credentials:

* **Username:** Your API Key

* **Password:** Your Secret Token

**1\. Getting Your API Key (Username)**

Your API Key serves as the username for Basic Authentication. To retrieve it:

1. Log in to the Logics Dashboard

2. Navigate to Security → API Key

3. Review the available API keys

4. Select an appropriate key based on your needs — GET permissions for read operations, POST permissions for write operations

**Important:** Ensure your selected API Key has the necessary permissions for your intended operations.

**2\. Getting Your Secret Token (Password)**

Your Secret Token serves as the password for Basic Authentication. To generate it:

1. Navigate to Settings → Integrations

2. Click Generate Token

3. Copy and securely store the generated token

**Security Note:** Treat your Secret Token like a password. Store it securely and never share it publicly.

**Using Your Credentials**

Include both credentials in the Basic Authentication header of every request:

| Authorization: Basic base64("\<API Key\>:\<Secret Token\>")   Username: Your API Key Password: Your Secret Token |
| :---- |

**Best Practices**

* Use API Keys with minimal required permissions

* Rotate your Secret Tokens regularly

* Never expose credentials in client-side code

* Store credentials in environment variables or secure key management systems

**Need Help?**

If you encounter authentication issues:

* Verify your API Key has the correct permissions

* Ensure your Secret Token is current and correctly copied

* Check that both credentials are properly formatted in your request headers

# **Appointment**

4 endpoints · Scopes used: **case.read / case.write**

###  **GET**    **Get Available Slots**

*Get available time slots for an agent on a given date.*

https\://valortax.logiqsapi.com/publicapi/V4/Appointment/GetAvailableSlots

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| email | String | Email of the agent | **Required** |
| date | Date | Date on which the slot has to be checked. Format: mm/dd/yyyy | **Required** |
| timezone | String | Current timezone (e.g. PST, EST, CST) | **Optional** |
| timeSlot | String | Slot length in minutes. Default is 30\. Value can be 30/60/90 | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": \[     "Available time slots in CST",     "8:00 AM-8:30 AM",     "8:30 AM-9:00 AM",     "9:00 AM-9:30 AM",     "9:30 AM-10:00 AM",     "10:00 AM-10:30 AM",     "10:30 AM-11:00 AM",     "11:00 AM-11:30 AM",     "11:30 AM-12:00 PM",     "12:00 PM-12:30 PM"   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-29T09:03:39.0291509Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns a JSON array of available time slots. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Book Appointment**

*Book an appointment with an agent.*

https\://valortax.logiqsapi.com/publicapi/V4/Appointment/BookAppointment

**Required scope: case.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| AgentEmail | String | Email of agent to book appointment with | **Required** |
| Date | DateTime | Date/time to book. Format: MM/dd/yyyy HH:mm AM/PM | **Required** |
| CaseID | String | Case to which the appointment is booked | **Required** |
| Comments | String | Description regarding the appointment | **Optional** |
| TimeZone | String | Current timezone (e.g. PST, EST, CST) | **Optional** |
| TimeSlot | String | Slot length in minutes. Default is 30\. Value can be 30/60/90 | **Optional** |
| Subject | String | Subject | **Optional** |
| EventTypeID | Integer | Event type, corresponds to TaskCategoryID | **Optional** |

**Example Response (200)**

| {   "status": "success",   "data": "null",   "message": "Your appointment has been booked with James Iddings on 11/16/2023 at 2:30 PM to 3:00 PM.",   "StatusCode": 200,   "Timestamp": "2025-05-01T08:15:23.1234567Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns a response containing the appointment details. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Update Appointment**

*Update an existing appointment with an agent.*

https\://valortax.logiqsapi.com/publicapi/V4/Appointment/UpdateAppointment

**Required scope: case.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| TaskID | Integer | TaskID of the appointment to update | **Required** |
| AgentEmail | String | Email of agent to reassign the appointment to | **Optional** |
| Date | DateTime | Updated date/time. Format: MM/dd/yyyy HH:mm AM/PM | **Optional** |
| Comments | String | Description regarding the appointment | **Optional** |
| TimeZone | String | Current timezone (e.g. PST, EST, CST) | **Optional** |
| TimeSlot | String | Slot length in minutes. Default is 30\. Value can be 30/60/90 | **Optional** |
| Subject | String | Subject | **Optional** |
| EventTypeID | Integer | Event type, corresponds to TaskCategoryID | **Optional** |

**Example Response (200)**

| {   "status": "success",   "data": "",   "message": "Appointment 1122 has updated successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-01T08:15:23.1234567Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns a response containing the appointment details. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Settlement Officer Email**

*Get the settlement officer's email for a case.*

https\://valortax.logiqsapi.com/publicapi/V4/Appointment/GetSetOfficerEmail

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | String | Case for which the settlement officer's email is retrieved | **Required** |

**Example Response (200)**

| {   "status": "success",   "data": "Settlement Officer: none@irslogics.com",   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-02T12:47:59.9876543Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the settlement officer's email. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Billing**

10 endpoints · Scopes used: **payments.read / payments.write**

###  **GET**    **Get Case Account**

*Gets a list of case accounts for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseAccount

**Required scope: payments.read**

**Note:** The property list in the data node grows over time — handle it defensively.

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which accounts are to be fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseAccountID": 62252,       "AccountType": 2,       "PrimaryAccount": true,       "BankName": "",       "BankRoutingNo": "",       "BankAccountNo": "\*\*\*\* \*\*\*\* \*\*\*\* 1111",       "CCType": 1,       "CCNo": "\*\*\*\* \*\*\*\* \*\*\*\* 1111",       "CCExpDate": "102024",       "CCSecurityNo": "",       "BillingAddressSameAsCase": false,       "Address": null,       "AptNo": null,       "City": null,       "State": "",       "Zip": "",       "NameOnAccount": "",       "CaseID": 284514,       "PhoneNo": "",       "EmailID": "",       "CreatedDate": "2021-03-05T04:04:23.547",       "ModifiedDate": "2021-03-05T04:04:23.547"     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-08T11:25:30.5566778Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's accounts (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create Case Account**

*Creates a case account (credit card or bank account) with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseAccount

**Required scope: payments.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the account is added | **Required** |
| AccountType | Integer | Type of case account | **Required** |
| PrimaryAccount | Boolean | Whether this is the primary account | **Optional** |
| BankName | String | Name of the bank | **Optional** |
| BankRoutingNo | String | Bank routing number | **Optional** |
| BankAccountNo | String | Bank account number | **Optional** |
| CCType | Integer | Credit card type | **Optional** |
| CCNo | String | Credit card number, format xxxxxxxxxxxxxxxx | **Optional** |
| CCExpDate | Date | Credit card expiry date, format MMYYYY | **Optional** |
| CCSecurityNo | String | Credit card CVV | **Optional** |
| BillingAddressSameAsCase | Boolean | Whether billing address matches case address | **Optional** |
| State | String | State — must be 2 characters (e.g. 'CA', 'NY') | **Optional** |
| City | String | City | **Optional** |
| Zip | String | Zip code | **Optional** |
| Address | String | Address | **Optional** |
| AptNo | String | Apartment number | **Optional** |
| NameOnAccount | String | Name on credit card or bank account | **Optional** |
| PhoneNo | String | Phone number, format (xxx)xxx-xxxx | **Optional** |
| EmailID | String | Email address | **Optional** |

*AccountType: Checking \= 1, CreditCard \= 2, Savings \= 3, BusinessChecking \= 4*

*CCType: Visa \= 1, MasterCard \= 2, AmExp \= 3, Discover \= 4*

**Example Response (200)**

| {   "Success": true,   "data": { "CaseAccountID": 128346 },   "message": "Case Account created successfully by User: Kim Danner",   "StatusCode": 200,   "Timestamp": "2025-05-11T01:03:27.1111111Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CaseAccountID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Case Payment**

*Gets a list of case payments for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CasePayment

**Required scope: payments.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which payments are to be fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CasePaymentID": 227072,       "CaseID": 297271,       "PaymentTypeID": null,       "PaidDate": "2021-08-23T00:00:00",       "CaseAccountID": null,       "CheckNumber": null,       "Amount": 100.0000,       "Comment": "Manual Cash Payment Was Successful.",       "TransactionID": null,       "TransactionStatus": "SUCCESS",       "TransactionComment": null,       "AuthorizationCode": null,       "CreatedDate": "2021-08-25T05:58:46.7738667Z",       "CreatedByUserFullName": "Joseph Christopher",       "CreatedBy": null,       "MerchantAccountID": null,       "CustomerIP": "::1",       "AccountUsed": null,       "GatewayRawReponse": null,       "Balance": 11021.1100,       "TagID": 1,       "TagName": null     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-14T15:59:59.4444444Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's payments (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create Case Payment**

*Create a case payment with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CasePayment

**Required scope: payments.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which payment is added | **Required** |
| PaymentTypeID | Integer | Type of case payment | **Optional** |
| CaseAccountID | Integer | Case Account ID (defaults to primary account) | **Optional** |
| MerchantAccountID | Integer | Merchant Account ID (defaults to primary) | **Optional** |
| Amount | Money | Payment amount | **Optional** |
| PaidDate | Date | Payment date | **Optional** |
| Comment | String | Payment comments | **Optional** |
| TagID | Integer | Payment tag ID | **Optional** |
| TagName | String | Tag name | **Optional** |
| InvoiceIds | String | Invoice ID(s) to apply. Single: "123". Multiple: "111,222,333" (no spaces) | **Optional** |

*PaymentTypeID: CreditCard \= 1, Checking \= 2, Cash \= 3, Refund \= 4, Offset \= 5, ChargeBack \= 6, Loan \= 8, Loan Offset \= 9*

*PaymentTypeID \= 3 only posts a record and does not run a payment.*

*PaymentTypeID \= 1 or 2 charges the credit card or bank account via the default merchant account provider.*

**Example Response (200)**

| {   "Success": true,   "data": { "CasePaymentID": 128346 },   "message": "Case Payment created successfully by User: Thomas Duff",   "StatusCode": 200,   "Timestamp": "2025-05-22T12:12:12.3453453Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CasePaymentID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Case Invoice**

*Gets a list of case invoices for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseInvoice

**Required scope: payments.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which invoices are to be fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseInvoiceID": 163964,       "CaseID": 297269,       "Date": "2021-07-20T00:00:00",       "InvoiceTypeID": 7,       "InvoiceTypeName": null,       "UnitPrice": 23.0000,       "Quantity": 1,       "Description": "",       "CreatedBy": 4133,       "CreatedByUserFullName": null,       "CreatedDate": "2021-07-20T00:00:00",       "ModifiedDate": null,       "ModifiedBy": null,       "ModifiedByUserFullName": null,       "TagID": 0,       "TagName": null     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-27T22:22:22.8908908Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's invoices (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create Case Invoice**

*Create a case invoice with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseInvoice

**Required scope: payments.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the invoice is added | **Required** |
| Quantity | Integer | Total items | **Required** |
| UnitPrice | Money | Price per item | **Required** |
| InvoiceTypeID | Integer | Type of case invoice | **Optional** |
| Date | Date | Invoice date | **Optional** |
| InvoiceTypeName | String | Invoice type name | **Optional** |
| Description | String | Invoice description | **Optional** |
| TagID | Integer | Payment tag ID | **Optional** |
| TagName | String | Tag name | **Optional** |
| RelatedInvoiceId | Integer | Invoice ID a discount is applied to. Required for discount-related invoice types. | **Conditional** |

**Example Response (200)**

| {   "Success": true,   "data": { "CaseInvoiceID": 128346 },   "message": "Case Payment created successfully by User: Rochelle Cole",   "StatusCode": 200,   "Timestamp": "2025-05-30T00:00:00.0000000Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CaseInvoiceID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Case Amortization**

*Gets a list of case amortization schedules for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseAmortization

**Required scope: payments.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which amortizations are to be fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseAmortizationID": 347307,       "CaseID": 297269,       "Amount": 1.0000,       "ScheduledDate": "2021-07-24T00:00:00",       "CreatedBy": 4133,       "CreatedByUserFullName": "Shreha Didwania",       "AutopayStatusID": 1,       "AutoSchedulerList": null     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-25T09:09:09.6786786Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's amortization schedule (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create Case Amortization**

*Create a case amortization schedule entry with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseAmortization

**Required scope: payments.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the amortization is added | **Required** |
| Amount | Money | Amount | **Required** |
| ScheduledDate | Date | Amortization date | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": { "CaseAmortizationID": 128346 },   "message": "",   "StatusCode": 200,   "Timestamp": "2025-05-28T05:05:05.9019019Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CaseAmortizationID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Update Case Amortization**

*Update an existing case amortization (payment schedule). Supports single and bulk updates.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/UpdateCaseAmortization

**Required scope: payments.write**

**Note:** Bulk Update: pass CaseID plus an AutoSchedulerList array, each item containing CaseAmortizationID (required) and Amount and/or ScheduledDate (at least one required). Example: { "CaseID": 349786, "AutoSchedulerList": \[{ "CaseAmortizationID": 345355, "Amount": 400.00, "ScheduledDate": "01/04/2026" }\] }

**Body Request — Single Update**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the amortization belongs | **Required** |
| CaseAmortizationID | Integer | ID of the amortization record to update | **Required** |
| Amount | Money | Updated amount. At least one of Amount / ScheduledDate is required. | **Conditional** |
| ScheduledDate | Date | Updated date, format mm/dd/yyyy. At least one of Amount / ScheduledDate is required. | **Conditional** |

**Example Response (200)**

| Single update: {   "Success": true,   "data": { "CaseAmortizationID": 342607 },   "message": "Case Amortization updated successfully by User: Thomas Duff",   "StatusCode": 200,   "Timestamp": "2026-04-28T10:30:45.1234567Z" }   Bulk update: {   "Success": true,   "data": { "UpdatedCaseAmortizationIDs": "345353,345354,345355" },   "message": "Case Amortization updated successfully by User: Thomas Duff",   "StatusCode": 200,   "Timestamp": "2026-04-28T10:35:12.9876543Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Single update returns the updated CaseAmortizationID; bulk update returns a comma-separated list of updated IDs. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Case Billing Summary**

*Get the case billing summary for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Billing/CaseBillingsummary

**Required scope: payments.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which the billing summary is fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": {     "TotalFees": 2000.00,     "PaidAmount": 600.00,     "PaidPercentage": "30.00%",     "Balance": 1400.00,     "AmountDue": 1400.00,     "DueDate": "04/06/2023",     "PastDue": 900.00   },   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-22T12:12:12.3453453Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns a summary of case billing (property list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: payments.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Case**

6 endpoints · Scopes used: **case.read / case.write**

###  **GET**    **Get Case**

*Get case values.*

https\://valortax.logiqsapi.com/publicapi/V4/Case/CaseInfo

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case to fetch | **Required** |
| details | String | Comma-separated field names added to the current Case object. Accepted values: setofficerid, attorneyid, casemanagerid, ctecid, caseworkerid, taxpreparerid, assignment1id, enrolledagentid, cpaid | **Optional** |
| udf | String | UDF value | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": {     "CaseID": 128346,     "FirstName": "first name",     "LastName": "last name",     "DOB": "07/24/1995",     "Status": 1,     "SaleDate": null,     "CellPhone": "",     "HomePhone": "",     "WorkPhone": "",     "Email": "test@test.com",     "City": "",     "State": "",     "Zip": "",     "Address": "",     "AptNo": "",     "MaritalStatus": "",     "BusinessName": "",     "BusinessType": "",     "BusinessAddress": "",     "TaxLiability": "",     "ServiceID": 89,     "ServiceID2": 62,     "ServiceID3": 29,     "ServiceID4": 2,     "ServiceID5": 4,     "ServiceID6": 25   },   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-13T15:33:03.4444444Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's core properties (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create Case**

*Creates a case with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/Case/CaseFile

**Required scope: case.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| LastName | String | Last name | **Required** |
| StatusID | Integer | Status to assign to the case | **Optional** |
| ProductID | Integer | Product the case belongs to (e.g. 1 for TR Case) | **Optional** |
| FirstName | String | First name | **Optional** |
| Email | String | Email | **Optional** |
| CellPhone | String | Cell phone, format (xxx)xxx-xxxx | **Optional** |
| WorkPhone | String | Work phone, format (xxx)xxx-xxxx | **Optional** |
| HomePhone | String | Home phone, format (xxx)xxx-xxxx | **Optional** |
| State | String | State — must be 2 characters (e.g. 'CA', 'NY') | **Optional** |
| City | String | City | **Optional** |
| Zip | String | Zip code | **Optional** |
| Address | String | Address | **Optional** |
| AptNo | String | Apartment number | **Optional** |
| SSN | String | SSN, format xxx-xx-xxxx | **Optional** |
| Marital\_Status | String | single | married filing jointly | married filing separately | head of household | qualifying widow(er) | **Optional** |
| TAX\_RELIEF\_TAX\_AGENCY | String | Agency for tax support. Comma-separated. Accepted: FEDERAL, STATE | **Optional** |
| TAX\_RELIEF\_TAX\_AMOUNT | String | Tax relief amount requested by the client | **Optional** |
| Opener | String | Opener | **Optional** |
| CPA/Attorney/EA | String | CPA / Attorney / EA | **Optional** |
| Set. Officer | String | Settlement officer | **Optional** |
| Tax Prep Coordinator | String | Tax prep coordinator | **Optional** |
| Language | String | Language | **Optional** |
| Notes | String | Notes | **Optional** |
| UDF | Array | UDF fields, e.g. \[{"UDFName1":"UDFValue1"}\] | **Optional** |
| DistributionId | Integer | Lead distribution ID | **Optional** |
| TaxProblem | String | See accepted values below | **Optional** |
| TAX\_RELIEF\_TAX\_TYPE | String | Personal | Business | Personal and Business | Payroll and Other | **Optional** |
| DOB | DateTime | Date of birth, format MM/dd/yyyy | **Optional** |
| SourceName | String | Source name | **Optional** |
| BusinessType | String | sole proprietorship | partnership | llp | llc (single) | llc (multiple) | s corp | c corp | trust | **Optional** |
| BusinessName | String | Business name | **Optional** |
| BusinessAddress | String | Business address | **Optional** |
| BusinessAptNo | String | Business apartment number | **Optional** |
| BusinessCity | String | Business city | **Optional** |
| BusinessState | String | Business state — 2 characters | **Optional** |
| BusinessZip | String | Business zip code | **Optional** |
| EIN | String | Employer ID number | **Optional** |
| SMSPermit | Bool | Opt-in for SMS | **Optional** |
| DuplicateCheck | String | Not posted into Logics — checks for duplicates using comma-separated fields: FirstName, LastName, MiddleName, DOB, Email, SSN, CellPhone, WorkPhone, HomePhone, BusinessName, EIN, Phones | **Optional** |

*TaxProblem accepted values: ACCOUNTING, ASSETS\_SEIZED, BANK\_ACCOUNT\_LEVY, CANT\_PAY\_UNPAID\_TAXES, INNOCENT\_SPOUSE, License\_Suspension\_Revocation, LIEN\_FILED, Passport\_Suspension\_Revocation, RECEIVED\_AUDIT\_NOTICE, UNPAID\_PENALTIES\_AND\_INTEREST, WAGE\_GARNISHMENT, RECEIVED\_IRS\_LETTER, ISSUE\_CLAIMING\_DEPENDENTS, ID\_THEFT, IRS\_REFUND, OTHER*

**Example Response (200)**

| {   "Success": true,   "data": { "CaseID": 344685 },   "message": "Case created successfully by User: Frankie Smith",   "StatusCode": 200,   "Timestamp": "2025-05-16T11:18:18.7777777Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CaseID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Update Case**

*Update a case with new values.*

https\://valortax.logiqsapi.com/publicapi/V4/UpdateCase/UpdateCase

**Required scope: case.write**

**Note:** Either CaseID or SearchPhone is required — provide at least one.

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to update | **Required** |
| SearchPhone | String | Search phone number, format (xxx)xxx-xxxx | **Required** |
| SetOfficerID | Integer | Settlement officer | **Optional** |
| CasemanagerID | Integer | Case manager | **Optional** |
| CaseworkerID | Integer | Case worker | **Optional** |
| AttorneyID | Integer | Attorney | **Optional** |
| CTECID | Integer | Opener ID / CTEC | **Optional** |
| TaxpreparerID | Integer | Tax preparer | **Optional** |
| Assignment1ID | Integer | Assignment 1 | **Optional** |
| EnrolledAgentID | Integer | Enrolled agent | **Optional** |
| HomePhone | String | Home phone, format (xxx)xxx-xxxx | **Optional** |
| CellPhone | String | Cell phone, format (xxx)xxx-xxxx | **Optional** |
| WorkPhone | String | Work phone, format (xxx)xxx-xxxx | **Optional** |
| StatusID | Integer | Status to assign to the case | **Optional** |
| TeamID | Integer | Team to assign to the case | **Optional** |
| FirstName | String | First name | **Optional** |
| MiddleName | String | Middle name | **Optional** |
| LastName | String | Last name | **Optional** |
| TaxAmount | Integer | Tax liability | **Optional** |
| DistributionId | Integer | Lead distribution ID | **Optional** |
| AptNo | String | Apartment number | **Optional** |
| Address | String | Address | **Optional** |
| State | String | State — 2 characters | **Optional** |
| City | String | City | **Optional** |
| Zip | String | Zip code | **Optional** |
| SSN | String | SSN, format xxx-xx-xxxx | **Optional** |
| DOB | DateTime | Date of birth, format MM/dd/yyyy | **Optional** |
| SourceID | Integer | Source | **Optional** |
| Email | String | Email | **Optional** |
| BusinessName | String | Business name | **Optional** |
| BusinessAddress | String | Business address | **Optional** |
| BusinessAptNo | String | Business apartment number | **Optional** |
| BusinessCity | String | Business city | **Optional** |
| BusinessState | String | Business state — 2 characters | **Optional** |
| BusinessZip | String | Business zip code | **Optional** |
| EmploymentTypeID | Integer | Employment type | **Optional** |
| BusinessOwnershipType | Integer | N/A (0), sole proprietorship (1), partnership (2), llp (3), llc single (4), llc multiple (5), s corp (6), c corp (7), trust (8) | **Optional** |
| EmployerIDNo | String | Business employer ID number | **Optional** |
| SpouseFirstName | String | Spouse first name | **Optional** |
| SpouseLastName | String | Spouse last name | **Optional** |
| SpouseMaidenName | String | Spouse maiden name | **Optional** |
| MartialStatus | Integer | single (0), married filing jointly (1), married filing separately (3), head of household (4), qualifying widow(er) (5) | **Optional** |
| SpouseDOB | DateTime | Spouse date of birth, format MM/dd/yyyy | **Optional** |
| SpouseDOM | DateTime | Spouse date of marriage, format MM/dd/yyyy | **Optional** |
| SpouseEmail | String | Spouse email | **Optional** |
| SpouseSSN | String | Spouse SSN, format xxx-xx-xxxx | **Optional** |
| ServiceID | Integer | Service 1 | **Optional** |
| ServiceID2 | Integer | Service 2 | **Optional** |
| ServiceID3 | Integer | Service 3 | **Optional** |
| ServiceID4 | Integer | Service 4 | **Optional** |
| ServiceID5 | Integer | Service 5 | **Optional** |
| ServiceID6 | Integer | Service 6 | **Optional** |
| ServiceOther | String | Other service | **Optional** |
| ServiceDetailIDs | String | Service detail IDs, e.g. "273,274" | **Optional** |
| UDF | Array | UDF fields, e.g. "UDF": \[{"udf232": "Approved", "udf231": 295}\] | **Optional** |
| TaxType | String | Personal | Business | Personal and Business | Payroll | Other | **Optional** |
| TaxProblem | String | See accepted values below | **Optional** |

*TaxProblem accepted values: ACCOUNTING, ASSETS\_SEIZED, BANK\_ACCOUNT\_LEVY, CANT\_PAY\_UNPAID\_TAXES, INNOCENT\_SPOUSE, License\_Suspension\_Revocation, LIEN\_FILED, Passport\_Suspension\_Revocation, RECEIVED\_AUDIT\_NOTICE, UNPAID\_PENALTIES\_AND\_INTEREST, WAGE\_GARNISHMENT, RECEIVED\_IRS\_LETTER, ISSUE\_CLAIMING\_DEPENDENTS, ID\_THEFT, IRS\_REFUND, OTHER*

**Example Response (200)**

| {   "Success": true,   "data": { "CaseID": 344689 },   "message": "Case updated successfully by User: George Remy",   "StatusCode": 200,   "Timestamp": "2025-05-20T16:16:16.2342342Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns case details with update status and user information. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Cases By Status**

*Get case IDs for a given status.*

https\://valortax.logiqsapi.com/publicapi/V4/Case/GetCasesByStatus

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| StatusID | Integer | StatusID value to retrieve all associated cases | **Required** |
| orderByCreatedDate | Boolean | Sorts results by CaseID when true. Default false (sorted by ModifiedDate) | **Optional** |
| page | Integer | Page number of results to retrieve. Default 1 | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": \[344683, 344667, 344655\],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-22T12:12:12.4564564Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns matching case IDs. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Stop SMS Permission**

*Stop SMS permission for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Case/StopSMS

**Required scope: case.write**

**Body Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which SMS permission is stopped | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": "null",   "message": "SMS successfully stopped by User: ",   "StatusCode": 200,   "Timestamp": "2025-05-25T09:09:09.7897897Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns confirmation that SMS was stopped. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Case Status Information**

*Gets case status information for a given StatusID.*

https\://valortax.logiqsapi.com/publicapi/V4/Case/CaseStatusInfo

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| StatusID | Integer | ID of the status of a particular case | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "StatusID": 355,       "StatusName": "Status 1",       "CPStatus": null,       "StatusDesc": "Edit Description",       "OrderNo": null,       "FolderID": 61,       "IsDefault": false,       "ProductID": null,       "FolderName": "Initial Payment Default",       "EnableFolderApproval": null,       "StageID": null,       "NextWorkFlow": "Next Work flow of the status"     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-10T22:10:15.1111111Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the status details (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Case Activity**

3 endpoints · Scopes used: **case.read / activity.write**

###  **GET**    **Get an Activity**

*Gets all activities on a case.*

https\://valortax.logiqsapi.com/publicapi/V4/CaseActivity/Activity

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case whose activities are fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": {     "CaseID": 264001,     "ActivityID": 8172803,     "Subject": "Assigned to SO: Case Analyst",     "Comment": "",     "Popup": null,     "Pin": null,     "ActivityType": "General",     "CreatedDate": "2015-03-06T17:45:33.233"   },   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-29T13:13:13.8765432Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's activities (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create an Activity**

*Create an activity with default values.*

https\://valortax.logiqsapi.com/publicapi/V4/CaseActivity/Activity

**Required scope: activity.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the activity is added | **Required** |
| ActivityType | String | Type of activity to add to the case | **Required** |
| Subject | String | Activity subject | **Required** |
| Comment | String | Activity comment | **Optional** |
| Popup | Boolean | Whether the activity pops up | **Optional** |
| Pin | Boolean | Whether the activity is pinned | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": { "ActivityID": 9164821 },   "message": "Case activity created successfully created by User: Hazel Smith",   "StatusCode": 200,   "Timestamp": "2025-05-24T06:06:06.6786786Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created CaseActivity record along with user details. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: activity.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Update an Activity**

*Update an existing activity.*

https\://valortax.logiqsapi.com/publicapi/V4/CaseActivity/Activity

**Required scope: activity.write**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| ActivityID | Integer | Activity to update | **Required** |
| CaseID | Integer | Case the activity belongs to | **Required** |
| Comment | String | Activity comment | **Optional** |
| Popup | Boolean | Whether the activity pops up | **Optional** |
| Pin | Boolean | Whether the activity is pinned | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": { "ActivityID": 878787 },   "message": "Case activity Updated successfully created by User: Anita Bonner",   "StatusCode": 200,   "Timestamp": "2025-05-29T13:13:13.8765432Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the updated CaseActivity record along with user details. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: activity.write |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Documents**

1 endpoint · Scopes used: **case.write**

###  **POST**    **Create Case Document**

*Uploads a file to a specific case as a Case Document. This endpoint accepts multipart/form-data.*

https\://valortax.logiqsapi.com/publicapi/V4/Documents/CaseDocument

**Required scope: case.write**

**Note:** Maximum uploaded file size is 6 MB per file — compress or optimize PDFs beforehand.

**Body Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the document is added | **Required** |
| Comment | String | Comment to add to the document | **Optional** |
| FileCategoryID | Integer | ID of the file category | **Optional** |
| File | File (form-data) | The file to upload | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": { "CaseDocumentID": 128346 },   "message": "File uploaded succefully by User: Pedro Medina",   "StatusCode": 200,   "Timestamp": "2025-05-18T04:20:10.9999999Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns case document details with upload status and user information. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.write |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Fax**

1 endpoint · Scopes used: **fax.write**

###  **POST**    **Send Fax**

*Send a fax with default values. This endpoint accepts multipart/form-data.*

https\://valortax.logiqsapi.com/publicapi/V4/Fax/SendFax

**Required scope: fax.write**

**Body Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the fax is sent | **Required** |
| faxNumber | String | Fax number | **Required** |
| faxMessage | String | Fax message | **Optional** |
| contentSummary | String | Fax content summary | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": null,   "message": "Fax initiated: 79ca211a-88e8 by User: Sam Peterson",   "StatusCode": 200,   "Timestamp": "2025-05-09T19:44:01.6543210Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns confirmation that the fax was initiated. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: fax.write |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Find**

3 endpoints · Scopes used: **case.read**

###  **GET**    **Find Case By Phone**

*Gets case details using a phone number.*

https\://valortax.logiqsapi.com/publicapi/V4/Find/FindCaseByPhone

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| phone | String | Phone number of the case to fetch details for | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseID": 344624,       "CreatedDate": "2023-04-21T06:52:18",       "FirstName": "Steve",       "LastName": "Joe",       "StatusID": 191,       "SaleDate": "2025-01-09T00:00:00",       "CellPhone": "234234232",       "HomePhone": "(121)121-2121",       "WorkPhone": "934543554",       "Email": "steve1234@hotmail.com",       "City": "city details",       "State": "NY",       "Zip": "66666-6666",       "Address": "",       "AptNo": "",       "Language": "",       "TaxAmount": 0.0000,       "TeamID": 0     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-17T23:45:00.8888888Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns matching cases with details (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Find Case By Last Name & Phone**

*Gets case details using a phone number and last name.*

https\://valortax.logiqsapi.com/publicapi/V4/Find/FindCase

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| lastName | String | Last name for fetching the case details | **Required** |
| phone | String | Phone number for fetching the case details | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseID": 344624,       "CreatedDate": "2023-04-21T06:52:18",       "FirstName": "Steve",       "LastName": "Joe",       "StatusID": 191,       "SaleDate": "2025-01-09T00:00:00",       "CellPhone": "234234232",       "HomePhone": "(121)121-2121",       "WorkPhone": "934543554",       "Email": "steve1234@hotmail.com",       "City": "city details",       "State": "NY",       "Zip": "66666-6666",       "Address": "",       "AptNo": "",       "Language": "",       "TaxAmount": 0.0000,       "TeamID": 0     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-13T15:33:03.4444444Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns matching cases with details (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Find Case By Email**

*Find case details using an email address.*

https\://valortax.logiqsapi.com/publicapi/V4/Find/FindCaseByEmail

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| email | String | Email of the case to fetch details for | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "CaseID": 344624,       "CreatedDate": "2023-04-21T06:52:18",       "FirstName": "Steve",       "LastName": "Joe",       "StatusID": 191,       "SaleDate": "2025-01-09T00:00:00",       "CellPhone": "234234232",       "HomePhone": "(121)121-2121",       "WorkPhone": "934543554",       "Email": "steve1234@hotmail.com",       "City": "city details",       "State": "NY",       "Zip": "66666-6666",       "Address": "",       "AptNo": "",       "Language": "",       "TaxAmount": 0.0000,       "TeamID": 0     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-13T15:33:03.4444444Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns matching cases with details (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Report**

1 endpoint · Scopes used: **reports.activityreport.read**

###  **POST**    **Get Activity Report**

*Gets an activity report for a time period. The report is emailed to the address supplied.*

https\://valortax.logiqsapi.com/publicapi/V4/Report/ActivityReport

**Required scope: reports.activityreport.read**

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| StartDate | Date | Start date | **Required** |
| EndDate | Date | End date | **Required** |
| ReportName | String | Must be set to 'ActivityReport' | **Required** |
| Email | String | Email address the report is sent to | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": {     "CaseID": 344625,     "ClientName": "Irene Flores",     "Type": "Document sent",     "ActivitySubject": "subject",     "Created": "01/21/2021 6:24:00 PM",     "CreatedBy": "Logics Support",     "TaskOrActivity": "Activity",     "LastModifiedDate": "01/21/2021 6:24:00 PM",     "LastModifiedBy": "Affiliate Self"   },   "message": "Data exported successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-04T21:03:39.0291509Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the report; the same report is emailed to the address supplied. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: reports.activityreport.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Services**

1 endpoint · Scopes used: **case.read**

###  **GET**    **Get Service Details**

*Get service details by IDs.*

https\://valortax.logiqsapi.com/publicapi/V4/Services/GetServiceDetails

**Required scope: case.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| caseID | Integer | ID of the case for which services are fetched | **Required** |
| serviceIds | String | Comma-separated service IDs to fetch details for, e.g. "12,44,11" | **Optional** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "ServiceId": 78,       "Name": "Service 1",       "ServiceDetails": \[         {           "Id": 27,           "Name": "ServiceDetailsName",           "Description": "Service Description"         }       \]     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-01T08:15:23.1234567Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns services with details (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: case.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **Task**

3 endpoints · Scopes used: **task.read / task.write**

###  **GET**    **Get a Task or Event**

*Gets a list of tasks/events for the provided CaseID.*

https\://valortax.logiqsapi.com/publicapi/V4/Task/Task

**Required scope: task.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | ID of the case for which tasks/events are fetched | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "TaskID": 577642,       "CreateBy": 2127,       "CreatedByName": "Saumendra P",       "DueDate": "2020-11-09T00:00:00",       "PriorityID": 0,       "CreateDate": "2020-11-09T12:45:42.75",       "CaseID": 288599,       "StatusID": 0,       "Subject": "test1",       "Comments": null,       "Reminder": null,       "ModifiedDate": "2020-11-09T12:46:13.027",       "ModifiedBy": 2127,       "Deleted": false,       "TaskType": 1,       "EndDate": null,       "LastReminded": null,       "Location": null,       "AllDayEvent": null,       "TaskCategoryID": null,       "TaskCategoryName": null,       "UserID": null,       "Users": \[         { "UserID": 357, "FullName": "A William" }       \]     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-05T17:22:11.7654321Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the case's tasks/events (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: task.read |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **POST**    **Create a Task or Event**

*Create a task/event with default values. A task only has a Due Date; an event also requires an EndDate. All date-times should be passed as UTC.*

https\://valortax.logiqsapi.com/publicapi/V4/Task/Task

**Required scope: task.write**

**Note:** If TaskType is 2 (Event), EndDate is required.

**Body Request**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| CaseID | Integer | Case to which the task is added | **Required** |
| Subject | String | Subject | **Required** |
| Reminder | DateTime | Reminder time | **Required** |
| TaskType | Integer | Task type | **Required** |
| DueDate | DateTime | Task due date | **Required** |
| UserID | Array | Array of user IDs | **Required** |
| EndDate | DateTime | Task end date | **Optional** |
| PriorityID | Integer | Priority ID | **Optional** |
| StatusID | Integer | Status ID | **Optional** |
| TaskCategoryID | Integer | Category ID | **Optional** |
| Comments | String | Comments | **Optional** |
| AllDayEvent | Boolean | Whether this is an all-day event | **Optional** |

*StatusID: 1 \= Mark Complete, 0 \= Mark Incomplete*

*PriorityID: 0 \= Normal, 1 \= Medium, 2 \= High, 3 \= Urgent*

*TaskType: 1 \= Task, 2 \= Event*

**Example Response (200)**

| {   "Success": true,   "data": { "TaskID": 128346 },   "message": "Task/Event created successfully by User: Frankie Smith",   "StatusCode": 201,   "Timestamp": "2025-05-30T00:00:00.0000000Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the created TaskID — store it for future reference. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: task.write |
| **500** | Internal Server Error. Please try again later or contact support. |

###  **GET**    **Get Tasks or Events by Date Range**

*Gets a list of tasks/events within the specified date range.*

https\://valortax.logiqsapi.com/publicapi/V4/Task/GetTasksByDateRange

**Required scope: task.read**

**Header Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| StartDate | String | Start date for filtering by DueDate, format mm/dd/yyyy | **Required** |
| EndDate | String | End date for filtering by DueDate, format mm/dd/yyyy | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": \[     {       "TaskID": 576745,       "CreateBy": 2127,       "CreatedByName": "Rob P",       "DueDate": "2025-04-04T02:30:00",       "PriorityID": 0,       "CreateDate": "2025-04-04T17:39:45.467",       "CaseID": 345692,       "StatusID": 0,       "Subject": "sssssssss",       "Comments": null,       "Reminder": "2025-04-04T02:00:00",       "ModifiedDate": "2025-04-04T17:39:45.467",       "ModifiedBy": 2127,       "Deleted": false,       "TaskType": 2,       "EndDate": "2025-05-04T03:30:00",       "LastReminded": null,       "Location": null,       "AllDayEvent": false,       "TaskCategoryID": null,       "TaskCategoryName": null,       "UserID": null,       "Users": \[         { "UserID": 2127, "FullName": "Rob P" }       \]     }   \],   "message": "Data retrieved successfully.",   "StatusCode": 200,   "Timestamp": "2025-05-05T17:22:11.7654321Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns tasks/events matching the date range (list grows over time). |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: task.read |
| **500** | Internal Server Error. Please try again later or contact support. |

# **User**

1 endpoint · Scopes used: **user.write**

###  **POST**    **Disable User**

*Disable a user by their email address.*

https\://valortax.logiqsapi.com/publicapi/V4/Users/DisableUser

**Required scope: user.write**

**Body Parameters**

| Parameter | Type | Description | Required |
| :---- | :---- | :---- | :---- |
| email | Email | User's email address | **Required** |

**Example Response (200)**

| {   "Success": true,   "data": "",   "message": "The User Kenny Davis has been disabled by User: Frankie Smith",   "StatusCode": 200,   "Timestamp": "2025-05-30T00:00:00.0000000Z" } |
| :---- |

**Response Codes**

| Status | Meaning |
| :---- | :---- |
| **200** | Returns the name of the user that was disabled. |
| **401** | Unauthorized. Missing or invalid Authorization header. Expected Basic authentication. |
| **403** | Access denied. Missing required scope: user.write |
| **500** | Internal Server Error. Please try again later or contact support. |

