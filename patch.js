const fs = require('fs');

try {
    let content = fs.readFileSync('c:/xampp/htdocs/SITEDEMO/MobilApp/FiyatGor/mobile/App.tsx', 'utf8');

    // 1. Add Sayim State.
    content = content.replace(
        "const [hasInitialSync, setHasInitialSync] = useState(false);",
        "const [hasInitialSync, setHasInitialSync] = useState(false);\n  const [appMode, setAppMode] = useState('menu');\n  const [depos, setDepos] = useState([]);\n  const [selectedDepo, setSelectedDepo] = useState(null);\n  const [showDepoModal, setShowDepoModal] = useState(false);\n  const [activeCart, setActiveCart] = useState([]);\n  const [isShowingCart, setIsShowingCart] = useState(false);\n  const [countInput, setCountInput] = useState('1');"
    );

    // Add XLSX import
    content = content.replace(
        "import * as IntentLauncher from 'expo-intent-launcher';",
        "import * as IntentLauncher from 'expo-intent-launcher';\nimport XLSX from 'xlsx';"
    );

    // 2. Add InitDB depo list fetch & load cart
    content = content.replace(
        "await updateStats();\n    }",
        "await updateStats();\n      const depoRes = await db.getAllAsync('SELECT DISTINCT depo_no, depo_adi FROM depo_stoklar WHERE depo_no IS NOT NULL ORDER BY depo_no');\n      setDepos(depoRes || []);\n      const savedDepoNo = await AsyncStorage.getItem('selected_depo_no');\n      if (savedDepoNo && depoRes) {\n         setSelectedDepo(depoRes.find((d) => d.depo_no === savedDepoNo) || depoRes[0]);\n      } else if(depoRes && depoRes.length > 0) {\n         setSelectedDepo(depoRes[0]);\n      }\n      const cartStr = await AsyncStorage.getItem('sayim_cart');\n      if(cartStr) setActiveCart(JSON.parse(cartStr));\n    }"
    );

    // 3. Add Sayim Logic Functions
    const sayimFunctions = "  const selectDepoAndSave = async (depo) => { setSelectedDepo(depo); await AsyncStorage.setItem('selected_depo_no', depo.depo_no); setShowDepoModal(false); };  const saveCartToStorage = async (newCart) => { setActiveCart(newCart); await AsyncStorage.setItem('sayim_cart', JSON.stringify(newCart)); };  const handleAddToCart = () => { if (!product || product.stock_code === '---' || !selectedDepo) return; const quantity = parseFloat(countInput); if (isNaN(quantity) || quantity <= 0) { Alert.alert('Hata', 'Lütfen geçerli bir adet giriniz.'); return; } const existingIndex = activeCart.findIndex(c => c.stock_code === product.stock_code); let newCart = [...activeCart]; if (existingIndex >= 0) { Alert.alert('Ürün Mevcut', 'Bu üründen ' + newCart[existingIndex].quantity + ' adet sayıldı. Üzerine ekleyelim mi?', [ { text: 'İptal', style: 'cancel' }, { text: 'Üzerine Ekle', onPress: () => { newCart[existingIndex].quantity += quantity; saveCartToStorage(newCart); setProduct(null); setScanned(false); } }, { text: 'Yeniden Yaz (Ez)', onPress: () => { newCart[existingIndex].quantity = quantity; saveCartToStorage(newCart); setProduct(null); setScanned(false); } } ]); } else { newCart.unshift({ barcode: product.barcode, stock_code: product.stock_code, name: product.name, depo_no: selectedDepo.depo_no, depo_adi: selectedDepo.depo_adi, quantity: quantity, added_at: new Date().toISOString() }); saveCartToStorage(newCart); Alert.alert('Başarılı', 'Sepete eklendi!'); setProduct(null); setScanned(false); } };  const generateAndSendExcel = async () => { if (activeCart.length === 0) return; try { const wb = XLSX.utils.book_new(); const excelData = activeCart.map((item, index) => ({ 'Sıra': index + 1, 'Barkod': item.barcode, 'Stok Kodu': item.stock_code, 'Ürün Adı': item.name, 'Depo No': item.depo_no, 'Depo Adı': item.depo_adi, 'Sayım Adedi': item.quantity, 'Tarih': new Date(item.added_at).toLocaleString('tr-TR') })); const ws = XLSX.utils.json_to_sheet(excelData); XLSX.utils.book_append_sheet(wb, ws, 'Sayım'); const wbout = XLSX.write(wb, {type: 'base64', bookType: 'xlsx'}); const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\\./g, '-'); const depoNameSafe = selectedDepo ? selectedDepo.depo_adi.replace(/[^a-z0-9]/gi, '_') : 'Depo'; const fileName = depoNameSafe + '-' + dateStr + '_Sayim.xlsx'; const uri = FileSystem.documentDirectory + fileName; await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 }); const form = new FormData(); form.append('chat_id', TELEGRAM_CHAT_ID); form.append('document', { uri: uri, name: fileName, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const res = await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendDocument', form, { headers: { 'Content-Type': 'multipart/form-data' } }); if (res.data.ok) { Alert.alert('Başarılı', 'Sayım dosyası yöneticilere iletildi.', [{text: 'Sepeti Temizle', onPress: () => { saveCartToStorage([]); setIsShowingCart(false); }}]); } } catch (err) { Alert.alert('Hata', 'Dosya gönderilemedi.'); } };";
    content = content.replace("const sendReport = async () => {", sayimFunctions + "\n  const sendReport = async () => {");

    // 4. Update the return UI to intercept `appMode`
    const menuReturnStr = "  if(appMode === 'menu') { return ( <View style={{flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', justifyContent: 'center', alignItems: 'center'}}> <StatusBar style={isDark ? 'light' : 'dark'} /> <Ionicons name='apps-outline' size={80} color={isDark ? '#3B82F6' : '#1E40AF'} style={{marginBottom:30}} /> <Text style={{color: isDark ? '#fff' : '#000', fontSize: 24, fontWeight: 'bold', marginBottom: 40}}>FiyatGör & Sayım Modülü</Text> <TouchableOpacity onPress={() => setAppMode('fiyatgor')} style={{backgroundColor: isDark ? '#3B82F6' : '#1E40AF', padding: 20, borderRadius: 20, width: '80%', alignItems: 'center', marginBottom: 20}}> <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Fiyat/Stok Gör (Genel)</Text> </TouchableOpacity> <TouchableOpacity onPress={() => setAppMode('sayim')} style={{backgroundColor: '#10B981', padding: 20, borderRadius: 20, width: '80%', alignItems: 'center'}}> <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold'}}>Depo Sayım Modu</Text> </TouchableOpacity> <TouchableOpacity onPress={() => handleSync(false)} style={{marginTop: 40, flexDirection: 'row', alignItems: 'center', opacity: 0.7}}> <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : undefined}><Ionicons name='sync' size={24} color={isDark ? '#fff' : '#000'} /></Animated.View> <Text style={{color: isDark ? '#fff' : '#000', marginLeft: 10}}>Verileri Senkronize Et</Text> </TouchableOpacity> </View> ); }";
    content = content.replace("return (\n    <SafeAreaView style={styles.container}>", menuReturnStr + "\n  return (\n    <SafeAreaView style={styles.container}>");

    // 5. Update header UI logic mapping
    const headerMods = "{/* Menu Back Button for both modes */}\n          <TouchableOpacity style={styles.headerBtn} onPress={() => { setAppMode('menu'); setIsShowingCart(false); }}>\n            <Ionicons name='apps' size={24} color={isDark ? '#3B82F6' : '#1E40AF'} />\n          </TouchableOpacity>\n";
    content = content.replace("{/* Sol buton: \\u00dcr\\u00fcn varsa Geri, yoksa Sync */}", headerMods + "{/* Sol buton: Geri / Sync */}");

    content = content.replace(
        "<Text style={styles.headerTitle}>Fiyat & Stok Bilgisi</Text>",
        "{appMode === 'sayim' && selectedDepo ? <TouchableOpacity onPress={() => setShowDepoModal(true)}><Text style={styles.headerTitle}>SAYIM | {selectedDepo.depo_adi}</Text></TouchableOpacity> : <Text style={styles.headerTitle}>Fiyat & Stok Bilgisi</Text>}"
    );

    const rightIconsReplace = "{appMode === 'sayim' && ( <TouchableOpacity style={styles.headerBtn} onPress={() => setIsShowingCart(true)}> <Ionicons name='cart' size={24} color={isDark ? '#3B82F6' : '#1E40AF'} /> {activeCart.length > 0 && <View style={{position:'absolute', top:0, right:0, backgroundColor:'red', borderRadius:10, width:20, height:20, justifyContent:'center', alignItems:'center'}}><Text style={{color:'white', fontSize:10, fontWeight:'bold'}}>{activeCart.length}</Text></View>} </TouchableOpacity> )}";
    content = content.replace("{/* Tema Değiştirme Butonu */}", rightIconsReplace + "\n            {/* Tema Değiştirme Butonu */}");

    // 6. Inject `isShowingCart` logic
    const cartRenderCode = "{isShowingCart ? ( <View style={{flex: 1, backgroundColor: isDark ? '#1E293B': '#fff', borderTopLeftRadius:30, borderTopRightRadius:30, padding: 20}}> <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 20}}> <TouchableOpacity onPress={() => setIsShowingCart(false)}><Ionicons name='arrow-back' size={28} color={isDark ? '#fff' : '#000'} /></TouchableOpacity> <Text style={{fontSize: 20, fontWeight: 'bold', marginLeft: 15, color: isDark ? '#fff' : '#000'}}>Sepetiniz ({activeCart.length} kalem)</Text> </View> <FlatList data={activeCart} keyExtractor={item => item.stock_code} renderItem={({item}) => ( <View style={{padding: 15, borderBottomWidth: 1, borderBottomColor: '#ccc', flexDirection: 'row', alignItems: 'center'}}> <View style={{flex: 1}}> <Text style={{color: isDark ? '#fff' : '#000', fontWeight: 'bold'}}>{item.name}</Text> <Text style={{color: '#888', fontSize: 12}}>{item.stock_code} - Depo: {item.depo_adi}</Text> </View> <Text style={{color: '#10B981', fontSize: 18, fontWeight: 'bold', marginRight: 15}}>{item.quantity}</Text> <TouchableOpacity onPress={() => saveCartToStorage(activeCart.filter(c => c.stock_code !== item.stock_code))}> <Ionicons name='trash' size={24} color='#EF4444' /> </TouchableOpacity> </View> )} /> <TouchableOpacity style={{backgroundColor: '#10B981', padding: 20, borderRadius: 20, alignItems: 'center'}} onPress={generateAndSendExcel}> <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>BİTİR VE YÖNETİCİYE GÖNDER</Text> </TouchableOpacity> </View> ) : ( <View style={styles.resultPanel}>";
    content = content.replace("<View style={styles.resultPanel}>", cartRenderCode);

    content = content.replace(
        "        </View>\n\n        {!searchQuery && !reportModalVisible && (",
        "        </View>\n        )} \n\n        {!searchQuery && !reportModalVisible && !isShowingCart && ("
    );

    // 7. Inject Count Input
    const sayimInputHtml = "{appMode === 'sayim' && product.stock_code !== '---' && ( <View style={{marginTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', paddingTop: 20, alignItems:'center'}}> <Text style={{color: isDark ? '#fff' : '#000', marginBottom: 10, fontSize: 16}}>Sayım Adedi:</Text> <TextInput style={{width: '60%', borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 15, fontSize: 24, textAlign: 'center', color: isDark ? '#fff' : '#000', backgroundColor: isDark ? '#333' : '#fff'}} keyboardType='numeric' value={countInput} onChangeText={setCountInput} selectTextOnFocus /> <TouchableOpacity style={{backgroundColor: '#3B82F6', padding: 15, borderRadius: 15, marginTop: 15, width: '100%', alignItems:'center'}} onPress={handleAddToCart}> <Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>SEPETE EKLE</Text> </TouchableOpacity> </View> )}";
    content = content.replace(
        "{/* İnternet bağlantısı yoksa uyarı */}",
        sayimInputHtml + "\n                  {/* İnternet bağlantısı yoksa uyarı */}"
    );

    // 8. Depo Selection Modal
    const depoModalHTML = "<Modal isVisible={showDepoModal} onBackdropPress={() => setShowDepoModal(false)} style={styles.modal}> <View style={styles.modalContent}> <Text style={styles.modalTitle}>Lütfen Depo Seçimi Yapın</Text> <FlatList data={depos} keyExtractor={d => d.depo_no} renderItem={({item}) => ( <TouchableOpacity onPress={() => selectDepoAndSave(item)} style={{padding: 15, borderBottomWidth: 1, borderColor: '#eee'}}> <Text style={{color: isDark ? '#fff' : '#000', fontSize: 16}}>{item.depo_no} - {item.depo_adi}</Text> </TouchableOpacity> )} style={{maxHeight: 300, marginTop: 20}} /> </View> </Modal>";
    content = content.replace("</SafeAreaView>", depoModalHTML + "\n    </SafeAreaView>");

    fs.writeFileSync('c:/xampp/htdocs/SITEDEMO/MobilApp/SayimApp/mobile/App.tsx', content);
    console.log("PATCH SUCCESS");
} catch (e) {
    console.error("PATCH FAILED", e);
}
