#include <stdio.h>
#include <string.h>

#include <CoreFoundation/CFString.h>
#include <AddressBook/ABAddressBookC.h>

#include "nsMemory.h"
#include "NativeAddressBook.h"
#include "NativeAddressCard.h"
#include "mozilla/ModuleUtils.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(NativeAddressBook)
NS_DEFINE_NAMED_CID(INATIVEADDRESSBOOK_IID);

static const
mozilla::Module::CIDEntry kAddressBookCIDs[] = {
    { &kINATIVEADDRESSBOOK_IID, false, NULL, NativeAddressBookConstructor },
    { NULL }
};

static const
mozilla::Module::ContractIDEntry
    kAddressBookContracts[] = {
    { NATIVEADDRESSBOOK_CONTRACTID, &kINATIVEADDRESSBOOK_IID },
    { NULL }
};

static const
mozilla::Module NativeAddressBookModule = {
    mozilla::Module::kVersion,
    kAddressBookCIDs,
    kAddressBookContracts,
    NULL
};

NSMODULE_DEFN(ContactPoolExtension) = &NativeAddressBookModule;


/* Implementation file */
NS_IMPL_ISUPPORTS1(NativeAddressBook, INativeAddressBook)

NativeAddressBook::NativeAddressBook()
{
  /* member initializers and constructor code */
}

NativeAddressBook::~NativeAddressBook()
{
  /* destructor code */
}


#define BUFSIZE 256

/* void getCards (out unsigned long count, [array, retval, size_is (count)] out INativeAddressCard cards); */
NS_IMETHODIMP NativeAddressBook::GetCards(PRUint32 *count NS_OUTPARAM, INativeAddressCard ***cards NS_OUTPARAM)
{
    ABAddressBookRef AB = ABGetSharedAddressBook();
    CFArrayRef peopleFound = ABCopyArrayOfAllPeople(AB);

    int i, j;

    // Where does this get freed?
    *cards = (INativeAddressCard **)
        nsMemory::Alloc(sizeof(INativeAddressCard*) * CFArrayGetCount(peopleFound));
    *count = CFArrayGetCount(peopleFound);
    
    for (i=0; i<CFArrayGetCount(peopleFound); i++) {
        NativeAddressCard *card = new NativeAddressCard();
        (*cards)[i] = card;
        card->AddRef();

        ABPersonRef person = (ABPersonRef)CFArrayGetValueAtIndex(peopleFound, i);
        CFTypeRef firstName = ABRecordCopyValue (person, kABFirstNameProperty);
        CFTypeRef lastName = ABRecordCopyValue (person, kABLastNameProperty);
        //CFTypeRef firstNamePhonetic = ABRecordCopyValue (person, kABFirstNamePhoneticProperty);
        //CFTypeRef lastNamePhonetic = ABRecordCopyValue (person, kABLastNamePhoneticProperty);
        CFTypeRef org = ABRecordCopyValue (person, kABOrganizationProperty);
        CFTypeRef dept = ABRecordCopyValue (person, kABDepartmentProperty);
        CFTypeRef title = ABRecordCopyValue (person, kABJobTitleProperty);
    
        CFTypeRef emails = ABRecordCopyValue (person, kABEmailProperty);// kABMultiStringProperty
        CFTypeRef phones = ABRecordCopyValue (person, kABPhoneProperty);// kABMultiStringProperty
        CFTypeRef addresses = ABRecordCopyValue (person, kABAddressProperty);// multi-dictionary
        CFTypeRef homePage = ABRecordCopyValue (person, kABHomePageProperty);// string - deprecated since 10.4
        CFTypeRef urls = ABRecordCopyValue (person, kABURLsProperty);// kABMultiStringProperty
        //CFDataRef image = ABPersonCopyImageData (person);
        CFArrayRef groups = ABPersonCopyParentGroups (person);

        if (firstName) {
            card->setFirstName((CFStringRef)firstName);
        }

        if (lastName) {
            card->setLastName((CFStringRef)lastName);
        }

        if (org) {
            card->setOrganization((CFStringRef)org);
        }
        if (dept) {
            card->setDepartment((CFStringRef)dept);
        }   
        if (title) {
            card->setTitle((CFStringRef)title);
        }

        if (emails) {
            for (j=0; j<ABMultiValueCount((ABMultiValueRef)emails); j++) {
                CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)emails, j);
                CFStringRef email = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)emails, j);
                card->setEmail(label, email);
            }
        }

        if (addresses) {
            for (j=0; j<ABMultiValueCount((ABMultiValueRef)addresses); j++) {
                CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)addresses, j);
                CFDictionaryRef anAddress = (CFDictionaryRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)addresses, j);
        
                CFStringRef aStreet = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressStreetKey);
                CFStringRef aCity = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCityKey);
                CFStringRef aState = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressStateKey);
                CFStringRef aZip = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressZIPKey);
                CFStringRef aCountry = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCountryKey);
                CFStringRef aCountryCode = (CFStringRef)CFDictionaryGetValue(anAddress, kABAddressCountryCodeKey);

                card->setAddress(label, aStreet, aCity, aState, aZip, aCountry, aCountryCode);
            }
        }

        if (phones) {
            for (j=0;j<ABMultiValueCount((ABMultiValueRef)phones);j++) {
                CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)phones, j);
                CFStringRef phone = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)phones, j);
                card->setPhone(label, phone);
            }
        }

        if (homePage) {
            card->setURL(CFStringCreateWithCString(NULL, "homepage", kCFStringEncodingUTF16), (CFStringRef)homePage);
        }

        if (urls) {
            for (j=0;j<ABMultiValueCount((ABMultiValueRef)urls);j++) {
                CFStringRef label = (CFStringRef)ABMultiValueCopyLabelAtIndex ((ABMultiValueRef)urls, j);
                CFStringRef url = (CFStringRef)ABMultiValueCopyValueAtIndex ((ABMultiValueRef)urls, j);
                card->setURL(label, url);
            }
        }
    
        if (groups) {
            for (j=0;j<CFArrayGetCount(groups);j++) {
                ABGroupRef group = (ABGroupRef)CFArrayGetValueAtIndex(groups, j);
                CFStringRef groupName = (CFStringRef)ABRecordCopyValue (group, kABGroupNameProperty);
                card->addGroup(groupName);
            }
        }
    }

    return NS_OK;
}

/*

void GetList(nsIArray** aResult) {
nsIArray getProperty(in string name);
      nsCOMPtr<nsIMutableArray> array = do_CreateInstance(NS_ARRAY_CONTRACTID);

  // append some elements
  ...

  // return it to the caller
  *aResult = array;
  NS_ADDREF(*aResult);
}

static const char *extractCFStringPtr(CFStringRef stringRef, char *buffer, unsigned int bufferSize)
{
    const char *ptr = CFStringGetCStringPtr(stringRef, kCFStringEncodingUTF16);
    if (ptr == NULL) {
        if (CFStringGetCString(stringRef, buffer, bufferSize, kCFStringEncodingUTF16)) ptr = buffer;
    }
    return ptr;
}

*/

